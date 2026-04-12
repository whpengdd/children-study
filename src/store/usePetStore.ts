// src/store/usePetStore.ts
//
// Wave 2 (Agent-Study). Live mirror of the current profile's Pet state so the
// StudyScreen corner companion (PetCompanion) and PetHome screen can both
// subscribe without each hitting Dexie on every render.
//
// Contract notes for sibling agents:
//   - PetCompanion (Agent-Pet) subscribes to `pet`, `lastXpGain`. These stay
//     in place for back-compat — do NOT rename.
//   - `lastEvent` is richer than `lastXpGain` and is consumed by StudyScreen
//     for XpGainToast + reaction kind.
//   - Only add new actions; don't rename existing ones. Agent-PetScreens may
//     add hatch helpers later.

import { create } from "zustand";

import * as petService from "../services/petService";
import type { Pet, PetRewardResult, PetSkill } from "../types";

interface PetStoreState {
  pet: Pet | null;
  /** Latest XP delta, used to animate XpGainToast in PetCompanion. */
  lastXpGain: number;
  /** Skills unlocked during this session — cleared on screen unmount. */
  unlockedThisSession: PetSkill[];
  /** True while an async load is in-flight. */
  loading: boolean;
  /** Raw result of the most recent rewardFromLearning call. */
  lastEvent?: PetRewardResult;
  /** Monotonic counter so identical events still re-trigger UI effects. */
  lastEventNonce: number;

  loadPet: (profileId: number) => Promise<void>;
  refreshPet: (profileId: number) => Promise<void>;
  handleRewardResult: (result: PetRewardResult) => void;
  clearSessionUnlocks: () => void;
  clearLastEvent: () => void;
}

export const usePetStore = create<PetStoreState>((set, get) => ({
  pet: null,
  lastXpGain: 0,
  unlockedThisSession: [],
  loading: false,
  lastEvent: undefined,
  lastEventNonce: 0,

  loadPet: async (profileId) => {
    set({ loading: true });
    try {
      const pet = (await petService.getPet(profileId)) ?? null;
      set({ pet, loading: false });
    } catch (err) {
      console.error("[usePetStore.loadPet] failed:", err);
      set({ loading: false });
    }
  },

  refreshPet: async (profileId) => {
    try {
      const pet = (await petService.getPet(profileId)) ?? null;
      set({ pet });
    } catch (err) {
      console.error("[usePetStore.refreshPet] failed:", err);
    }
  },

  handleRewardResult: (result) => {
    // lastXpGain is signed so PetCompanion flips the reaction to "wrong" on
    // negative deltas. The actual XP stat is monotonic in petService.
    // We use a small negative sentinel for zero-XP events that still need a
    // "wrong" reaction (e.g. tier2_wrong has xp 0 but should grumble the pet).
    const { xpGained, skillsUnlocked } = result;
    const st = get();
    const newUnlocks = skillsUnlocked.length > 0
      ? [...st.unlockedThisSession, ...skillsUnlocked]
      : st.unlockedThisSession;
    set({
      lastEvent: result,
      lastEventNonce: st.lastEventNonce + 1,
      lastXpGain: xpGained,
      unlockedThisSession: newUnlocks,
    });
  },

  clearSessionUnlocks: () => set({ unlockedThisSession: [] }),
  clearLastEvent: () => set({ lastEvent: undefined, lastXpGain: 0 }),
}));
