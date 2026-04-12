// src/store/useStudyStore.ts
//
// Wave 2 (Agent-Study). Holds the live state for an in-progress study session.
// The store is intentionally flat and serializable-friendly so future devs can
// persist it across reloads if they want; for Wave 2 we just keep it in memory.
//
// Responsibilities:
//   - Build the queue via queueBuilder on entry to StudyScreen/ReviewScreen.
//   - Track the cursor (index into queue) and which items have been "seen"
//     this session so progressService can dedupe Tier-1 exposures.
//   - Collect session stats for the "Session complete!" summary screen.
//   - Surface the latest reward (xp/reaction) so UI can flash XpGainToast +
//     PetReaction briefly. UI consumes via `clearLastReward` after animating.

import { create } from "zustand";

import { buildTodayQueue } from "../services/queueBuilder";
import type {
  LearningPath,
  SessionItem,
  Settings,
  PetSkill,
} from "../types";

export type StudyStatus = "idle" | "loading" | "ready" | "exhausted";

export interface SessionStats {
  correct: number;
  wrong: number;
  /** Words that hit tier 5 during this session. */
  graduated: number;
  /** Brand-new words that started fresh this session (scenarioIndex 0 first visit). */
  newWordsStarted: number;
  /** Count of review items completed this session (tier-5). */
  reviewsCompleted: number;
  /** Sum of XP earned (forwarded from pet reward events). */
  xpGained: number;
}

export type LastRewardReaction = "correct" | "wrong" | "celebrate";

export interface LastReward {
  xp: number;
  reaction: LastRewardReaction;
  skillsUnlocked?: PetSkill[];
  stageChanged?: boolean;
  /** Nonce so repeated rewards of the same kind still trigger the animation. */
  nonce: number;
}

interface StudyStoreState {
  queue: SessionItem[];
  /** Index into `queue` — the item currently being shown. */
  index: number;
  /** Dedupe set. Keys look like "<wordId>:<scenarioIndex>". */
  seenInSession: Set<string>;
  /** Word-ids seen for the first time in this session (for `newWordsStarted`). */
  sessionNewWordIds: Set<string>;
  /** Epoch ms of session start. */
  sessionStart: number;
  sessionStats: SessionStats;
  status: StudyStatus;
  lastReward?: LastReward;

  loadQueue: (
    profileId: number,
    path: LearningPath,
    settings: Settings,
    opts?: { reviewOnly?: boolean; replay?: boolean },
  ) => Promise<void>;
  advance: () => void;
  reset: () => void;
  markSeen: (key: string) => void;
  setLastReward: (reward: Omit<LastReward, "nonce">) => void;
  clearLastReward: () => void;
  recordCorrect: () => void;
  recordWrong: () => void;
  recordGraduated: () => void;
  recordReviewCompleted: () => void;
  recordNewWordStart: (wordId: string) => void;
  recordXpGained: (xp: number) => void;
}

function freshStats(): SessionStats {
  return {
    correct: 0,
    wrong: 0,
    graduated: 0,
    newWordsStarted: 0,
    reviewsCompleted: 0,
    xpGained: 0,
  };
}

export const useStudyStore = create<StudyStoreState>((set, get) => ({
  queue: [],
  index: 0,
  seenInSession: new Set<string>(),
  sessionNewWordIds: new Set<string>(),
  sessionStart: Date.now(),
  sessionStats: freshStats(),
  status: "idle",
  lastReward: undefined,

  loadQueue: async (profileId, path, settings, opts) => {
    set({
      status: "loading",
      queue: [],
      index: 0,
      seenInSession: new Set<string>(),
      sessionNewWordIds: new Set<string>(),
      sessionStart: Date.now(),
      sessionStats: freshStats(),
      lastReward: undefined,
    });
    try {
      let queue = await buildTodayQueue(profileId, path, settings, {
        replay: opts?.replay,
      });
      if (opts?.reviewOnly) {
        queue = queue.filter((item) => item.kind === "review");
      }
      set({
        queue,
        index: 0,
        status: queue.length === 0 ? "exhausted" : "ready",
      });
    } catch (err) {
      console.error("[useStudyStore.loadQueue] failed:", err);
      set({ status: "exhausted", queue: [], index: 0 });
    }
  },

  advance: () => {
    const { queue, index } = get();
    const next = index + 1;
    if (next >= queue.length) {
      set({ index: next, status: "exhausted" });
    } else {
      set({ index: next });
    }
  },

  reset: () =>
    set({
      queue: [],
      index: 0,
      seenInSession: new Set<string>(),
      sessionNewWordIds: new Set<string>(),
      sessionStart: Date.now(),
      sessionStats: freshStats(),
      status: "idle",
      lastReward: undefined,
    }),

  markSeen: (key) => {
    // Mutate the set in place and publish a shallow-new wrapper so zustand
    // still notices the change.
    const s = get().seenInSession;
    s.add(key);
    set({ seenInSession: s });
  },

  setLastReward: (reward) =>
    set((st) => ({
      lastReward: {
        ...reward,
        nonce: (st.lastReward?.nonce ?? 0) + 1,
      },
    })),
  clearLastReward: () => set({ lastReward: undefined }),

  recordCorrect: () =>
    set((st) => ({
      sessionStats: { ...st.sessionStats, correct: st.sessionStats.correct + 1 },
    })),
  recordWrong: () =>
    set((st) => ({
      sessionStats: { ...st.sessionStats, wrong: st.sessionStats.wrong + 1 },
    })),
  recordGraduated: () =>
    set((st) => ({
      sessionStats: {
        ...st.sessionStats,
        graduated: st.sessionStats.graduated + 1,
      },
    })),
  recordReviewCompleted: () =>
    set((st) => ({
      sessionStats: {
        ...st.sessionStats,
        reviewsCompleted: st.sessionStats.reviewsCompleted + 1,
      },
    })),
  recordNewWordStart: (wordId) => {
    const s = get().sessionNewWordIds;
    if (s.has(wordId)) return;
    s.add(wordId);
    set((st) => ({
      sessionNewWordIds: s,
      sessionStats: {
        ...st.sessionStats,
        newWordsStarted: st.sessionStats.newWordsStarted + 1,
      },
    }));
  },
  recordXpGained: (xp) =>
    set((st) => ({
      sessionStats: {
        ...st.sessionStats,
        xpGained: st.sessionStats.xpGained + xp,
      },
    })),
}));
