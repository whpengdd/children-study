// src/store/useSettingsStore.ts
//
// Wave 2 — Agent-Shell. Persists a per-profile Settings row to the Dexie
// `settings` table. Each profile gets its own independent settings
// (e.g. different API keys, different carousel speed).

import { create } from "zustand";

import { db } from "../data/db";
import type { Settings } from "../types";

/**
 * Default settings used for brand-new profiles. Kept in a module-level
 * function so callers can clone without mutation.
 */
export function defaultSettings(profileId: number): Settings {
  return {
    profileId,
    ambientMode: false,
    carouselSpeed: "normal",
    voiceAccent: "us",
    maxNewWordsPerSession: 10,
    dueLookaheadMs: 1000 * 60 * 60 * 24, // 1 day
    anthropicApiKey: undefined,
    showGenerationMode: "offline",
    dailyShowAiQuota: 3,
  };
}

interface SettingsStoreState {
  settings: Settings | null;
  loading: boolean;

  /**
   * Load (or create w/ defaults) the settings row for a given profile.
   * Exposed as both `loadForProfile` (Agent-Shell) and `loadSettings`
   * (Agent-Study) to match the two calling conventions in the codebase.
   */
  loadForProfile: (profileId: number) => Promise<void>;
  loadSettings: (profileId: number) => Promise<void>;
  /** Merge + persist. Allowed keys are any Settings field except `profileId`. */
  updateField: <K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ) => Promise<void>;
  /** Batch-merge variant used when multiple fields change at once. */
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  /** Reset the entire settings row for the current profile back to defaults. */
  resetForProfile: (profileId: number) => Promise<void>;
  clear: () => void;
}

async function loadImpl(profileId: number): Promise<Settings> {
  try {
    const existing = await db.settings.get(profileId);
    if (existing) {
      return { ...defaultSettings(profileId), ...existing };
    }
    const fresh = defaultSettings(profileId);
    await db.settings.put(fresh);
    return fresh;
  } catch (err) {
    console.warn("[useSettingsStore] loadImpl failed:", err);
    return defaultSettings(profileId);
  }
}

export const useSettingsStore = create<SettingsStoreState>((set, get) => ({
  settings: null,
  loading: false,

  loadForProfile: async (profileId) => {
    set({ loading: true });
    const merged = await loadImpl(profileId);
    set({ settings: merged, loading: false });
  },

  loadSettings: async (profileId) => {
    set({ loading: true });
    const merged = await loadImpl(profileId);
    set({ settings: merged, loading: false });
  },

  updateField: async (key, value) => {
    const current = get().settings;
    if (!current) return;
    if (key === "profileId") return; // guard against accidental remapping
    const next: Settings = { ...current, [key]: value };
    set({ settings: next });
    try {
      await db.settings.put(next);
    } catch (err) {
      console.warn("[useSettingsStore] updateField persist failed:", err);
    }
  },

  updateSettings: async (patch) => {
    const current = get().settings;
    if (!current) return;
    const safe = { ...patch };
    delete (safe as { profileId?: number }).profileId;
    const next: Settings = { ...current, ...safe };
    set({ settings: next });
    try {
      await db.settings.put(next);
    } catch (err) {
      console.warn("[useSettingsStore] updateSettings persist failed:", err);
    }
  },

  resetForProfile: async (profileId) => {
    const fresh = defaultSettings(profileId);
    set({ settings: fresh });
    try {
      await db.settings.put(fresh);
    } catch (err) {
      console.warn("[useSettingsStore] resetForProfile persist failed:", err);
    }
  },

  clear: () => set({ settings: null }),
}));
