// src/services/progressService.ts
//
// The learning state machine. Each exported public function does DB I/O and
// returns a `LearningRewardEvent` (or list) so that the glue layer in Wave 2
// can forward them to `petService.rewardFromLearning`. We intentionally do
// NOT import petService here — coupling is one-way.
//
// The state machine lives in pure functions (`applyExposure`, `applyCheck`,
// `applyReview`) that accept a full `WordProgress` and return a new one plus
// the events emitted. The public wrappers (`completeExposure`, `submitCheck`,
// `submitReview`) are the only places that touch Dexie. This split makes the
// state machine unit-testable without a fake-IDB.

import { db } from "../data/db";
import { syncWordProgress, syncCheckAttempt } from "./syncService";
import type { Word } from "../types/vocab";
import type {
  CheckAttempt,
  LearningRewardEvent,
  SessionItem,
  WordProgress,
} from "../types/progress";
import { cardFromStorable, cardToStorable } from "../utils/fsrsSerde";
import { initialCard, rateCard, Rating } from "./srsService";
import type { Grade } from "./srsService";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Same tier-table as the plan's pseudocode. Exported so tests can hit it. */
export function tierAt(scenarioIndex: number): 1 | 2 | 3 | 4 {
  if (scenarioIndex < 3) return 1;
  if (scenarioIndex < 5) return 2;
  if (scenarioIndex < 8) return 3;
  return 4;
}

/** Build a fresh WordProgress row for `word`. */
export function makeFreshProgress(
  profileId: number,
  word: Word,
  now: Date = new Date(),
): WordProgress {
  const iso = now.toISOString();
  const card = initialCard(now);
  return {
    profileId,
    wordId: word.id,
    tier: 1,
    scenarioIndex: 0,
    tierAttempts: [0, 0, 0, 0],
    tierWrongs: [0, 0, 0, 0],
    firstSeenAt: iso,
    lastSeenAt: iso,
    lastAdvancedAt: iso,
    fsrsCard: cardToStorable(card),
    fsrsDue: card.due.getTime(),
    totalGraduations: 0,
    totalLapses: 0,
  };
}

/**
 * Load-or-create the progress row for a (profileId, word) pair. Only used by
 * the impure wrappers; the pure core takes a pre-loaded row.
 */
export async function getOrCreate(
  profileId: number,
  word: Word,
): Promise<WordProgress> {
  const existing = await db.wordProgress.get([profileId, word.id]);
  if (existing) return existing;
  const fresh = makeFreshProgress(profileId, word);
  await db.wordProgress.put(fresh);
  return fresh;
}

// ---------------------------------------------------------------------------
// Pure state transitions
// ---------------------------------------------------------------------------

export interface ApplyExposureResult {
  progress: WordProgress;
  learningEvent?: LearningRewardEvent;
  /** True if scenarioIndex actually moved forward. */
  advanced: boolean;
}

/**
 * Tier-1 passive card was watched to completion. Dedupe via the session-level
 * seenInSession set the caller owns so replaying the same carousel card
 * doesn't double-count XP.
 */
export function applyExposure(
  p: WordProgress,
  item: SessionItem,
  seenInSession: Set<string>,
  now: Date = new Date(),
): ApplyExposureResult {
  const dedupeKey = `${item.word.id}:${item.scenarioIndex}`;
  if (seenInSession.has(dedupeKey)) {
    return { progress: p, advanced: false };
  }
  seenInSession.add(dedupeKey);

  // The plan only advances if the caller is on or past the current position.
  const next = { ...p };
  const nextIndex = Math.max(next.scenarioIndex, item.scenarioIndex + 1);
  const advanced = nextIndex > next.scenarioIndex;
  next.scenarioIndex = nextIndex;
  next.tier = tierAt(next.scenarioIndex);

  const iso = now.toISOString();
  next.lastSeenAt = iso;
  if (advanced) next.lastAdvancedAt = iso;

  const result: ApplyExposureResult = { progress: next, advanced };
  if (advanced) {
    result.learningEvent = {
      kind: "tier1_exposure",
      wordId: item.word.id,
    };
  }
  return result;
}

export interface ApplyCheckResult {
  progress: WordProgress;
  attempt: CheckAttempt;
  learningEvent: LearningRewardEvent;
  /** Old tier → new tier, for UI celebration / tier-badge updates. */
  stageChange?: { from: 1 | 2 | 3 | 4 | 5; to: 1 | 2 | 3 | 4 | 5 };
  /** True if this check caused graduation into FSRS (tier 5). */
  graduated: boolean;
}

/**
 * Tier 2–4 active recall submission. Full state machine from the plan.
 *
 *   - Record the attempt.
 *   - Bump tierAttempts / tierWrongs counters.
 *   - If correct: advance scenarioIndex, maybe graduate at 10.
 *   - If incorrect AND tier=4 AND wrongs >= 2: roll back to Tier 3 at index 6.
 */
export function applyCheck(
  p: WordProgress,
  item: SessionItem,
  correct: boolean,
  latencyMs: number,
  now: Date = new Date(),
): ApplyCheckResult {
  const next: WordProgress = {
    ...p,
    tierAttempts: p.tierAttempts.slice(),
    tierWrongs: p.tierWrongs.slice(),
  };

  // Derive tier from scenarioIndex. A tier-5 (review) check shouldn't reach
  // this function; if it does, default to 5 so we don't index out of bounds.
  const t: 1 | 2 | 3 | 4 | 5 =
    item.scenarioIndex < 10 ? tierAt(item.scenarioIndex) : 5;

  const iso = now.toISOString();
  const attempt: CheckAttempt = {
    profileId: p.profileId,
    wordId: item.word.id,
    scenarioIndex: item.scenarioIndex,
    // CheckAttempt's type only allows 1..4; cap at 4 if we somehow got 5.
    tier: (t === 5 ? 4 : t) as 1 | 2 | 3 | 4,
    kind: item.scenario.kind,
    correct,
    latencyMs,
    ts: iso,
  };

  // Counters — even tier 5 ghost-rows bump the highest bucket harmlessly.
  const bucket = Math.min(t, 4) - 1;
  next.tierAttempts[bucket] = (next.tierAttempts[bucket] ?? 0) + 1;
  if (!correct) {
    next.tierWrongs[bucket] = (next.tierWrongs[bucket] ?? 0) + 1;
  }

  const prevTier = next.tier;
  let graduated = false;
  let learningEvent: LearningRewardEvent;

  if (correct) {
    next.scenarioIndex = Math.max(next.scenarioIndex, item.scenarioIndex + 1);
    next.tier = tierAt(Math.min(next.scenarioIndex, 9));
    next.lastAdvancedAt = iso;

    if (next.scenarioIndex === 10) {
      graduateToFsrs(next, latencyMs, next.tierWrongs[3] ?? 0, now);
      graduated = true;
    }

    if (t === 2) {
      learningEvent = { kind: "tier2_correct", wordId: item.word.id };
    } else if (t === 3) {
      learningEvent = { kind: "tier3_correct", wordId: item.word.id };
    } else if (t === 4) {
      learningEvent = {
        kind: "tier4_correct",
        wordId: item.word.id,
        graduated,
      };
    } else {
      // Tier 1 shouldn't submit a check (it's passive) but keep the types tidy.
      learningEvent = { kind: "tier1_exposure", wordId: item.word.id };
    }
  } else {
    // Rollback rule: Tier 4 with ≥2 wrongs goes back to Tier 3 (index 6).
    // Reset tierWrongs[3] so the kid gets fresh attempts when reaching Tier 4 again.
    if (t === 4 && (next.tierWrongs[3] ?? 0) >= 2) {
      next.scenarioIndex = Math.max(5, next.scenarioIndex - 2);
      next.tier = 3;
      next.tierWrongs[3] = 0;
      learningEvent = { kind: "tier4_wrong_fall", wordId: item.word.id };
    } else if (t === 2) {
      learningEvent = { kind: "tier2_wrong", wordId: item.word.id };
    } else if (t === 3) {
      learningEvent = { kind: "tier3_wrong", wordId: item.word.id };
    } else if (t === 4) {
      // First Tier-4 wrong: still signal the wrong branch so pet gets a grumpy
      // reaction, but no rollback yet.
      learningEvent = { kind: "tier4_wrong_fall", wordId: item.word.id };
    } else {
      learningEvent = { kind: "tier2_wrong", wordId: item.word.id };
    }
  }

  next.lastSeenAt = iso;

  const stageChange =
    prevTier !== next.tier
      ? { from: prevTier, to: next.tier }
      : undefined;

  return {
    progress: next,
    attempt,
    learningEvent,
    stageChange,
    graduated,
  };
}

/** Mutates `p` in place — only called by the pure core after it cloned. */
function graduateToFsrs(
  p: WordProgress,
  lastLatency: number,
  tier4Wrongs: number,
  now: Date,
): void {
  const card0 = cardFromStorable(p.fsrsCard);
  let rating: Grade;
  if (tier4Wrongs === 0 && lastLatency < 5000) rating = Rating.Easy;
  else if (tier4Wrongs === 0) rating = Rating.Good;
  else if (tier4Wrongs === 1) rating = Rating.Hard;
  else rating = Rating.Again;

  const { card: nextCard } = rateCard(card0, rating, now);
  p.fsrsCard = cardToStorable(nextCard);
  p.fsrsDue = nextCard.due.getTime();
  p.tier = 5;
  p.totalGraduations = (p.totalGraduations ?? 0) + 1;
}

export interface ApplyReviewResult {
  progress: WordProgress;
  attempt: CheckAttempt;
  learningEvent: LearningRewardEvent;
  /** True if this review counted as a lapse (wrong answer in FSRS phase). */
  lapsed: boolean;
}

/**
 * FSRS review submission. Rating is inferred from correctness + latency per
 * the plan: wrong → Again, fast right → Good, slow right → Hard.
 */
export function applyReview(
  p: WordProgress,
  item: SessionItem,
  correct: boolean,
  latencyMs: number,
  now: Date = new Date(),
): ApplyReviewResult {
  const next: WordProgress = { ...p };
  const card = cardFromStorable(next.fsrsCard);
  const rating = !correct
    ? Rating.Again
    : latencyMs < 4000
      ? Rating.Good
      : Rating.Hard;
  const { card: nextCard } = rateCard(card, rating, now);
  next.fsrsCard = cardToStorable(nextCard);
  next.fsrsDue = nextCard.due.getTime();
  const lapsed = !correct;
  if (lapsed) next.totalLapses = (next.totalLapses ?? 0) + 1;

  const iso = now.toISOString();
  next.lastSeenAt = iso;

  const attempt: CheckAttempt = {
    profileId: p.profileId,
    wordId: item.word.id,
    scenarioIndex: item.scenarioIndex,
    tier: 4, // closest type-safe value — real tier is 5 but the type is 1..4
    kind: item.scenario.kind,
    correct,
    latencyMs,
    ts: iso,
  };

  const learningEvent: LearningRewardEvent = correct
    ? { kind: "review_correct", wordId: item.word.id }
    : { kind: "review_wrong", wordId: item.word.id };

  return { progress: next, attempt, learningEvent, lapsed };
}

// ---------------------------------------------------------------------------
// Public (impure) API — does the DB I/O around the pure core
// ---------------------------------------------------------------------------

export interface CompleteExposureResult {
  learningEvent?: LearningRewardEvent;
}

export async function completeExposure(
  profileId: number,
  item: SessionItem,
  seenInSession: Set<string>,
): Promise<CompleteExposureResult> {
  const p = await getOrCreate(profileId, item.word);
  const result = applyExposure(p, item, seenInSession);
  if (result.advanced) {
    await db.wordProgress.put(result.progress);
    syncWordProgress(profileId, result.progress);
  }
  return { learningEvent: result.learningEvent };
}

export interface SubmitCheckResult {
  learningEvent: LearningRewardEvent;
  stageChange?: { from: 1 | 2 | 3 | 4 | 5; to: 1 | 2 | 3 | 4 | 5 };
  graduated: boolean;
}

export async function submitCheck(
  profileId: number,
  item: SessionItem,
  correct: boolean,
  latencyMs: number,
): Promise<SubmitCheckResult> {
  const p = await getOrCreate(profileId, item.word);
  const result = applyCheck(p, item, correct, latencyMs);
  await db.checkAttempts.add(result.attempt);
  await db.wordProgress.put(result.progress);
  syncCheckAttempt(profileId, result.attempt);
  syncWordProgress(profileId, result.progress);
  return {
    learningEvent: result.learningEvent,
    stageChange: result.stageChange,
    graduated: result.graduated,
  };
}

export interface SubmitReviewResult {
  learningEvent: LearningRewardEvent;
}

export async function submitReview(
  profileId: number,
  item: SessionItem,
  correct: boolean,
  latencyMs: number,
): Promise<SubmitReviewResult> {
  const p = await getOrCreate(profileId, item.word);
  const result = applyReview(p, item, correct, latencyMs);
  await db.checkAttempts.add(result.attempt);
  await db.wordProgress.put(result.progress);
  syncCheckAttempt(profileId, result.attempt);
  syncWordProgress(profileId, result.progress);
  return { learningEvent: result.learningEvent };
}
