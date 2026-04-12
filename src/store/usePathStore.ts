// src/store/usePathStore.ts
//
// Wave 2 — Agent-Shell. Tracks the LearningPath for the currently active
// profile. On `setPath` the value is persisted to `profile.lastPath` via
// pathService so reopening the app restores the last-studied grade/exam.

import { create } from "zustand";

import { getCurrentPath, setCurrentPath } from "../services/pathService";
import type { LearningPath } from "../types";
import { useProfileStore } from "./useProfileStore";

interface PathStoreState {
  path: LearningPath | null;
  /** Profile ID this path belongs to (if any), so a profile switch clears stale state. */
  profileId: number | null;

  /**
   * Set the learning path. Persists to the active profile's `lastPath`
   * automatically. Works with either a raw path (uses active profile) or an
   * explicit profileId.
   */
  setPath: (path: LearningPath) => void;
  /** Explicitly set the path for a given profile and persist. */
  setPathForProfile: (profileId: number, path: LearningPath) => Promise<void>;
  loadForProfile: (profileId: number) => Promise<void>;
  clear: () => void;
}

export const usePathStore = create<PathStoreState>((set) => ({
  path: null,
  profileId: null,

  loadForProfile: async (profileId) => {
    try {
      const path = await getCurrentPath(profileId);
      set({ path, profileId });
    } catch (err) {
      console.warn("[usePathStore] loadForProfile failed:", err);
      set({ path: null, profileId });
    }
  },

  setPath: (path) => {
    // Look up active profile synchronously; if present, persist in the
    // background. This matches the Wave 0 contract that Agent-Study uses.
    const active = useProfileStore.getState().activeProfile;
    set({ path, profileId: active?.id ?? null });
    if (active?.id != null) {
      setCurrentPath(active.id, path).catch((err) => {
        console.warn("[usePathStore] setPath persist failed:", err);
      });
    }
  },

  setPathForProfile: async (profileId, path) => {
    set({ path, profileId });
    try {
      await setCurrentPath(profileId, path);
    } catch (err) {
      console.warn("[usePathStore] setPathForProfile persist failed:", err);
    }
  },

  clear: () => set({ path: null, profileId: null }),
}));
