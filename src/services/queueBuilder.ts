// src/services/queueBuilder.ts
//
// Builds today's study queue for a given profile and LearningPath. Output is
// a flat SessionItem[] ready for StudyScreen to iterate. Design invariants
// from the plan:
//
//   1. Review items (FSRS due) take priority over new words.
//   2. Fresh words appear as contiguous 3-item blocks (first-time dense).
//   3. Queue order is deterministic for a given (profileId, date) so that
//      refreshing the page doesn't reshuffle mid-session.
//   4. Each "drip" word has a 30-minute cooldown between advances.
//
// The builder is a pure function w.r.t. its inputs in two flavors:
//   - `buildTodayQueue(profileId, path, settings)` — impure wrapper that
//     touches Dexie and vocabLoader.
//   - `buildQueueFrom({ words, progressByWordId, path, settings, now })` — pure,
//     good for tests and deterministic integration.

import { db } from "../data/db";
import { loadCatalog } from "../data/vocabLoader";
import type { LearningPath } from "../types/path";
import type { SessionItem, WordProgress } from "../types/progress";
import type { Settings } from "../types/settings";
import type { Word } from "../types/vocab";
import { startOfDay } from "../utils/date";
import { deterministicShuffle } from "../utils/shuffle";

// ---------------------------------------------------------------------------
// Path filter
// ---------------------------------------------------------------------------

/** Filter a flat word list by the currently chosen LearningPath. */
export function filterByPath(words: Word[], path: LearningPath): Word[] {
  if (path.kind === "pep") {
    return words.filter((w) => w.tags.pepGrade === path.grade);
  }
  return words.filter((w) => w.tags.exam?.includes(path.exam));
}

// ---------------------------------------------------------------------------
// Interleave (review → drip → fresh blocks)
// ---------------------------------------------------------------------------

export interface InterleaveInput {
  reviews: SessionItem[];
  drips: SessionItem[];
  /** Each inner array is a contiguous fresh block of (typically) 3 cards. */
  freshBlocks: SessionItem[][];
}

/**
 * Combine the three buckets into a single queue:
 *
 *   [...reviews, ...drips, ...flatten(freshBlocks)]
 *
 * Fresh blocks are kept as contiguous triples so the kid sees the same new
 * word three times in a row (sentence → image → dialog). Reviews come first
 * so FSRS-due items never get pushed down by an influx of new cards.
 */
export function interleave(input: InterleaveInput): SessionItem[] {
  const out: SessionItem[] = [];
  for (const r of input.reviews) out.push(r);
  for (const d of input.drips) out.push(d);
  for (const block of input.freshBlocks) {
    for (const item of block) out.push(item);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Pure core: given preloaded data, compute the queue
// ---------------------------------------------------------------------------

export interface BuildQueueContext {
  words: Word[];
  progressByWordId: Map<string, WordProgress>;
  path: LearningPath;
  settings: Settings;
  now?: number;
  /** When true, skip the 30-min drip cooldown so "replay" rebuilds a non-empty queue. */
  replay?: boolean;
}

export function buildQueueFrom(ctx: BuildQueueContext): SessionItem[] {
  const now = ctx.now ?? Date.now();
  const sod = startOfDay(now);
  const filtered = filterByPath(ctx.words, ctx.path);

  const freshBlocks: SessionItem[][] = [];
  const dripItems: SessionItem[] = [];
  const reviewItems: SessionItem[] = [];

  for (const w of filtered) {
    const p = ctx.progressByWordId.get(w.id);

    // 1) Fresh word → first-time dense block of Tier-1 cards (index 0,1,2).
    if (!p || p.scenarioIndex === 0) {
      if (w.scenarios.length >= 3) {
        freshBlocks.push(
          [0, 1, 2].map((i) => ({
            kind: "new_fresh" as const,
            word: w,
            scenario: w.scenarios[i],
            scenarioIndex: i,
            progress: p ?? null,
          })),
        );
      }
      continue;
    }

    // 2) In-progress (scenarioIndex 1..9) → drip with 30-min cooldown.
    if (p.scenarioIndex > 0 && p.scenarioIndex < 10) {
      const DRIP_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
      if (ctx.replay || Date.parse(p.lastAdvancedAt) + DRIP_COOLDOWN_MS < now) {
        const idx = p.scenarioIndex;
        if (idx >= 0 && idx < w.scenarios.length) {
          dripItems.push({
            kind: "new_drip",
            word: w,
            scenario: w.scenarios[idx],
            scenarioIndex: idx,
            progress: p,
          });
        }
      }
      continue;
    }

    // 3) Graduated (tier 5) → FSRS review if due (with lookahead).
    if (p.tier === 5 && p.fsrsDue <= now + ctx.settings.dueLookaheadMs) {
      // Rotate scenario position so reviews don't feel repetitive.
      const daysSinceFirst = Math.floor(
        (sod - Date.parse(p.firstSeenAt)) / 86_400_000,
      );
      const reviewIdx = ((daysSinceFirst % 10) + 10) % 10;
      if (reviewIdx >= 0 && reviewIdx < w.scenarios.length) {
        reviewItems.push({
          kind: "review",
          word: w,
          scenario: w.scenarios[reviewIdx],
          scenarioIndex: reviewIdx,
          progress: p,
        });
      }
    }
  }

  // Deterministic shuffle of fresh blocks, then cap by maxNewWordsPerSession.
  const maxFresh = ctx.settings.maxNewWordsPerSession ?? 10;
  const shuffledFresh = deterministicShuffle(freshBlocks, sod).slice(
    0,
    maxFresh,
  );

  return interleave({
    reviews: reviewItems,
    drips: dripItems,
    freshBlocks: shuffledFresh,
  });
}

// ---------------------------------------------------------------------------
// Public impure wrapper — used by StudyScreen
// ---------------------------------------------------------------------------

/**
 * Loads catalog + wordProgress from Dexie and runs buildQueueFrom. This is
 * the only function StudyScreen needs to know about.
 */
export async function buildTodayQueue(
  profileId: number,
  path: LearningPath,
  settings: Settings,
  opts?: { replay?: boolean },
): Promise<SessionItem[]> {
  const catalog = await loadCatalog();
  const progs = await db.wordProgress
    .where("profileId")
    .equals(profileId)
    .toArray();
  const byId = new Map<string, WordProgress>(progs.map((p) => [p.wordId, p]));
  return buildQueueFrom({
    words: catalog.words,
    progressByWordId: byId,
    path,
    settings,
    replay: opts?.replay,
  });
}
