// src/services/profileService.ts
//
// CRUD for the `profiles` Dexie table. Names must be unique (enforced by this
// service since Dexie's string primary index would error late otherwise). All
// timestamps are ISO strings.

import Dexie from "dexie";
import { db } from "../data/db";
import { api } from "./apiClient";
import { syncProfileUpdate } from "./syncService";
import type { Profile } from "../types/profile";

export interface CreateProfileInput {
  name: string;
  avatarEmoji: string;
}

export interface ProfileServiceError {
  kind: "duplicate_name" | "not_found" | "invalid_input";
  message: string;
}

/** Insert a brand-new profile row. Rejects duplicate names. */
export async function createProfile(
  input: CreateProfileInput,
): Promise<Profile> {
  const name = (input.name ?? "").trim();
  if (!name) throw toError("invalid_input", "Name is required");
  const emoji = (input.avatarEmoji ?? "").trim() || "🐱";

  const existing = await db.profiles.where("name").equals(name).first();
  if (existing) throw toError("duplicate_name", `Name "${name}" is taken`);

  const now = new Date().toISOString();
  const row: Profile = {
    name,
    avatarEmoji: emoji,
    createdAt: now,
    lastActiveAt: now,
  };

  // Try server first, then local Dexie
  try {
    const serverRow = await api.createProfile({ name, avatarEmoji: emoji });
    const serverId = serverRow.id as number;
    const localRow = { ...row, id: serverId };
    await db.profiles.put(localRow);
    return localRow;
  } catch {
    // Server unreachable — create locally, sync later
    const id = await db.profiles.add(row);
    return { ...row, id };
  }
}

/** Return every profile, newest active first. Try server, fallback to local. */
export async function listProfiles(): Promise<Profile[]> {
  try {
    const serverList = await api.listProfiles();
    // Sync server profiles to local Dexie for offline access
    const profiles = serverList.map((r) => ({
      id: r.id as number,
      name: r.name as string,
      avatarEmoji: r.avatarEmoji as string,
      createdAt: r.createdAt as string,
      lastActiveAt: r.lastActiveAt as string,
      lastPath: r.lastPath as Profile["lastPath"],
    }));
    for (const p of profiles) {
      await db.profiles.put(p);
    }
    return profiles.sort(
      (a, b) => Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt),
    );
  } catch {
    // Server unreachable — use local
    const all = await db.profiles.toArray();
    return all.sort(
      (a, b) => Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt),
    );
  }
}

/** Fetch a single profile by its auto-increment id. */
export async function getProfile(id: number): Promise<Profile | undefined> {
  return db.profiles.get(id);
}

/**
 * Hard-delete a profile and cascade to all related tables so no orphan data
 * remains in IndexedDB.
 */
export async function deleteProfile(id: number): Promise<void> {
  const existing = await db.profiles.get(id);
  if (!existing) throw toError("not_found", `Profile ${id} not found`);

  // Delete on server (fire-and-forget — local cascade still runs)
  api.deleteProfile(id).catch(() => {});

  // Cascade delete all profile-owned data in a single transaction.
  await db.transaction(
    "rw",
    [
      db.profiles,
      db.wordProgress,
      db.checkAttempts,
      db.sessionHistory,
      db.settings,
      db.pets,
      db.petEvents,
      db.shows,
    ],
    async () => {
      await db.wordProgress.where("profileId").equals(id).delete();
      await db.checkAttempts.where("[profileId+wordId]").between(
        [id, Dexie.minKey],
        [id, Dexie.maxKey],
      ).delete();
      await db.sessionHistory.where("[profileId+date]").between(
        [id, Dexie.minKey],
        [id, Dexie.maxKey],
      ).delete();
      await db.settings.delete(id);
      await db.pets.delete(id);
      await db.petEvents.where("[profileId+ts]").between(
        [id, Dexie.minKey],
        [id, Dexie.maxKey],
      ).delete();
      await db.shows.where("[profileId+createdAt]").between(
        [id, Dexie.minKey],
        [id, Dexie.maxKey],
      ).delete();
      await db.profiles.delete(id);
    },
  );
}

/** Touch `lastActiveAt` to now. Called on each successful screen enter. */
export async function updateLastActive(id: number): Promise<void> {
  const lastActiveAt = new Date().toISOString();
  await db.profiles.update(id, { lastActiveAt });
  syncProfileUpdate(id, { lastActiveAt });
}

function toError(
  kind: ProfileServiceError["kind"],
  message: string,
): Error & ProfileServiceError {
  const e = new Error(message) as Error & ProfileServiceError;
  e.kind = kind;
  e.message = message;
  return e;
}
