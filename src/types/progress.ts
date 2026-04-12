// src/types/progress.ts
//
// Learning state: per-word progress, individual check attempts, and the
// SessionItem envelope consumed by StudyScreen / ReviewScreen.

import type { Scenario } from "./vocab";
import type { Word } from "./vocab";

/**
 * Serializable form of a ts-fsrs `Card`. ts-fsrs stores `due` / `last_review`
 * as Date objects, which Dexie can handle but JSON/IDB round-trips prefer
 * primitives. We pin the shape here so the SRS helper can convert both ways.
 */
export interface SerializableCard {
  due: number;              // epoch ms
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number;            // ts-fsrs State enum value
  last_review?: number;     // epoch ms
}

export interface WordProgress {
  profileId: number;
  wordId: string;

  /** 1..4 during the scenarios stage; 5 means graduated into FSRS. */
  tier: 1 | 2 | 3 | 4 | 5;
  /** 0..10; the NEXT scenario position to surface. 10 means graduated. */
  scenarioIndex: number;
  /** Attempts counted per tier: [t1, t2, t3, t4]. */
  tierAttempts: number[];
  /** Wrong answers counted per tier: [t1, t2, t3, t4]. */
  tierWrongs: number[];

  firstSeenAt: string;
  lastSeenAt: string;
  /** Last time scenarioIndex actually moved forward. Used for daily pacing. */
  lastAdvancedAt: string;

  /** FSRS card state — only meaningful once tier === 5. */
  fsrsCard: SerializableCard;
  /** Convenience mirror of fsrsCard.due for cheap Dexie index lookups. */
  fsrsDue: number;
  totalGraduations: number;
  totalLapses: number;
}

/** Raw attempt record — every Tier 2–4 answer submission writes one. */
export interface CheckAttempt {
  profileId: number;
  wordId: string;
  scenarioIndex: number;
  tier: 1 | 2 | 3 | 4;
  kind: Scenario["kind"];
  correct: boolean;
  /** How long the child took to submit, ms. Fed into FSRS rating inference. */
  latencyMs: number;
  ts: string;
}

/**
 * What the queue builder hands to StudyScreen. The `kind` field is a tagged
 * union so UI can decide whether this cell is a fresh-block member, a daily
 * drip, or a review.
 */
export type SessionItem =
  | {
      kind: "new_fresh";
      word: Word;
      scenario: Scenario;
      scenarioIndex: number;
      progress: WordProgress | null;
    }
  | {
      kind: "new_drip";
      word: Word;
      scenario: Scenario;
      scenarioIndex: number;
      progress: WordProgress;
    }
  | {
      kind: "review";
      word: Word;
      scenario: Scenario;
      scenarioIndex: number;
      progress: WordProgress;
    };

/**
 * The canonical learning → pet reward event emitted by progressService.
 * petService.rewardFromLearning consumes this and never reads WordProgress
 * directly, so the two layers stay one-way coupled.
 */
export type LearningRewardEvent =
  | { kind: "tier1_exposure";   wordId: string }
  | { kind: "tier2_correct";    wordId: string }
  | { kind: "tier2_wrong";      wordId: string }
  | { kind: "tier3_correct";    wordId: string }
  | { kind: "tier3_wrong";      wordId: string }
  | { kind: "tier4_correct";    wordId: string; graduated: boolean }
  | { kind: "tier4_wrong_fall"; wordId: string }
  | { kind: "review_correct";   wordId: string }
  | { kind: "review_wrong";     wordId: string };
