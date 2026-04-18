// src/store/useProfileStore.ts
//
// Wave 2 — Agent-Shell. Dexie-backed CRUD over profileService, plus an
// `activeProfile` selector that Route components (PathSelect, Settings, Stats)
// subscribe to. `lastProfileId` is mirrored to localStorage so reopening the
// app jumps straight to PathSelect for returning users.

import { create } from "zustand";

import {
  createProfile as createProfileRow,
  deleteProfile as deleteProfileRow,
  listProfiles,
  updateLastActive,
} from "../services/profileService";
import { pullSnapshot } from "../services/syncService";
import { db } from "../data/db";
import type { Profile } from "../types";

const LAST_PROFILE_KEY = "childrenStudy.lastProfileId";

function readLastProfileId(): number | null {
  try {
    const raw = typeof localStorage !== "undefined"
      ? localStorage.getItem(LAST_PROFILE_KEY)
      : null;
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function writeLastProfileId(id: number | null): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (id == null) localStorage.removeItem(LAST_PROFILE_KEY);
    else localStorage.setItem(LAST_PROFILE_KEY, String(id));
  } catch {
    /* ignore */
  }
}

interface ProfileStoreState {
  /** All profiles loaded from Dexie. */
  profiles: Profile[];
  /** The profile currently selected on ProfileGate. */
  activeProfile: Profile | null;
  /** True while the initial load from Dexie is in-flight. */
  loading: boolean;

  loadProfiles: () => Promise<void>;
  createProfile: (
    profile: Omit<Profile, "id" | "createdAt" | "lastActiveAt">,
  ) => Promise<Profile>;
  selectProfile: (profileId: number) => Promise<void>;
  updateProfile: (profileId: number, patch: Partial<Profile>) => Promise<void>;
  deleteProfile: (profileId: number) => Promise<void>;
  clearActive: () => void;
}

export const useProfileStore = create<ProfileStoreState>((set, get) => ({
  profiles: [],
  activeProfile: null,
  loading: false,

  loadProfiles: async () => {
    set({ loading: true });
    try {
      const profiles = await listProfiles();
      // Auto-restore last profile (if still present) on first load.
      let activeProfile: Profile | null = get().activeProfile;
      if (!activeProfile) {
        const lastId = readLastProfileId();
        if (lastId != null) {
          activeProfile = profiles.find((p) => p.id === lastId) ?? null;
        }
      }
      set({ profiles, activeProfile, loading: false });
    } catch (err) {
      console.warn("[useProfileStore] loadProfiles failed:", err);
      set({ profiles: [], activeProfile: null, loading: false });
    }
  },

  createProfile: async (input) => {
    const row = await createProfileRow({
      name: input.name,
      avatarEmoji: input.avatarEmoji,
    });
    // Re-fetch so the newest active ordering from profileService is respected.
    const profiles = await listProfiles();
    set({ profiles });
    return row;
  },

  selectProfile: async (profileId) => {
    const row = get().profiles.find((p) => p.id === profileId);
    if (!row) {
      // Try refetching in case this id came from localStorage and we haven't loaded yet.
      await get().loadProfiles();
      const retry = get().profiles.find((p) => p.id === profileId);
      if (!retry) throw new Error(`profile ${profileId} not found`);
      await updateLastActive(profileId).catch(() => {});
      writeLastProfileId(profileId);
      set({ activeProfile: retry });
      // Pull latest data from server (non-blocking)
      pullSnapshot(profileId).catch(() => {});
      return;
    }
    await updateLastActive(profileId).catch(() => {});
    writeLastProfileId(profileId);
    set({ activeProfile: row });
    // Pull latest data from server (non-blocking)
    pullSnapshot(profileId).catch(() => {});
  },

  updateProfile: async (profileId, patch) => {
    // Only safe fields — never allow overwriting the primary id.
    const safe: Partial<Profile> = { ...patch };
    delete (safe as { id?: number }).id;
    await db.profiles.update(profileId, safe);
    const profiles = await listProfiles();
    const active = get().activeProfile;
    const nextActive =
      active?.id === profileId
        ? (profiles.find((p) => p.id === profileId) ?? null)
        : active;
    set({ profiles, activeProfile: nextActive });
  },

  deleteProfile: async (profileId) => {
    await deleteProfileRow(profileId);
    const profiles = await listProfiles();
    const active = get().activeProfile;
    let nextActive = active;
    if (active?.id === profileId) {
      nextActive = null;
      writeLastProfileId(null);
    }
    set({ profiles, activeProfile: nextActive });
  },

  clearActive: () => {
    writeLastProfileId(null);
    set({ activeProfile: null });
  },
}));
