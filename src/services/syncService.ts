// src/services/syncService.ts
//
// Coordination layer between Dexie (local) and the server API.
//
// Write-through: every local Dexie write also fires a server sync call.
// If the server is unreachable the write is queued in localStorage and
// retried automatically.
//
// Snapshot pull: on profile select, fetch full data from server and
// overwrite local Dexie tables for that profile.

import { db } from "../data/db";
import { api } from "./apiClient";
import type {
  WordProgress,
  CheckAttempt,
  Pet,
  PetEvent,
  Settings,
  Show,
  Profile,
} from "../types";
import type { SessionHistoryEntry } from "../data/db";

// ---------------------------------------------------------------------------
// Offline retry queue
// ---------------------------------------------------------------------------

const QUEUE_KEY = "childrenStudy.syncQueue";
const RETRY_INTERVAL = 10_000; // 10s
const MAX_QUEUE = 200;

interface QueueEntry {
  id: number;
  method: string;
  args: unknown[];
  ts: number;
}

let nextQueueId = Date.now();

function loadQueue(): QueueEntry[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(q: QueueEntry[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE)));
  } catch { /* quota exceeded — drop oldest */ }
}

function enqueue(method: string, args: unknown[]) {
  const q = loadQueue();
  q.push({ id: nextQueueId++, method, args, ts: Date.now() });
  saveQueue(q);
}

/** Fire a sync call. On network error, enqueue for retry. */
async function fireSync(method: string, args: unknown[]): Promise<void> {
  try {
    const fn = (api as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[method];
    if (fn) await fn(...args);
  } catch (err: unknown) {
    // Network errors or timeouts → queue for retry
    const isNetworkError =
      err instanceof TypeError || // fetch network error
      (err instanceof DOMException && err.name === "AbortError"); // timeout
    if (isNetworkError) {
      enqueue(method, args);
    } else {
      console.warn(`[sync] ${method} failed:`, err);
    }
  }
}

/** Drain the retry queue. Called on interval. */
async function drainQueue(): Promise<void> {
  const q = loadQueue();
  if (q.length === 0) return;

  // Quick health check first
  try {
    await api.health();
  } catch {
    return; // server still down
  }

  const remaining: QueueEntry[] = [];
  for (const entry of q) {
    try {
      const fn = (api as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[entry.method];
      if (fn) await fn(...entry.args);
    } catch {
      remaining.push(entry);
    }
  }
  saveQueue(remaining);
}

// Start retry loop
let retryTimer: ReturnType<typeof setInterval> | null = null;

export function startSyncLoop() {
  if (retryTimer) return;
  retryTimer = setInterval(drainQueue, RETRY_INTERVAL);
}

export function stopSyncLoop() {
  if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
}

// ---------------------------------------------------------------------------
// Write-through sync helpers (called by services after Dexie writes)
// ---------------------------------------------------------------------------

export function syncWordProgress(profileId: number, wp: WordProgress) {
  fireSync("syncProgress", [profileId, wp]);
}

export function syncCheckAttempt(profileId: number, attempt: CheckAttempt) {
  fireSync("syncAttempts", [profileId, [attempt]]);
}

export function syncSettings(profileId: number, settings: Settings) {
  // Strip anthropicApiKey — never send to server
  const { anthropicApiKey: _, ...clean } = settings as Settings & { anthropicApiKey?: string };
  fireSync("syncSettings", [profileId, clean]);
}

export function syncPet(profileId: number, pet: Pet) {
  fireSync("syncPet", [profileId, pet]);
}

export function syncPetEvents(profileId: number, events: PetEvent[]) {
  if (events.length === 0) return;
  fireSync("syncPetEvents", [profileId, events]);
}

export function syncShow(profileId: number, show: Show) {
  fireSync("syncShow", [profileId, show]);
}

export function syncProfileUpdate(profileId: number, patch: Record<string, unknown>) {
  fireSync("updateProfile", [profileId, patch]);
}

// ---------------------------------------------------------------------------
// Snapshot pull — overwrite local Dexie with server data
// ---------------------------------------------------------------------------

export async function pullSnapshot(profileId: number): Promise<boolean> {
  try {
    const snap = await api.getSnapshot(profileId) as {
      profile: Profile;
      wordProgress: WordProgress[];
      checkAttempts: CheckAttempt[];
      sessionHistory: SessionHistoryEntry[];
      settings: Settings | null;
      pet: Pet | null;
      petEvents: PetEvent[];
      shows: Show[];
    };

    await db.transaction(
      "rw",
      [db.wordProgress, db.checkAttempts, db.sessionHistory,
       db.settings, db.pets, db.petEvents, db.shows],
      async () => {
        // Clear existing local data for this profile
        await db.wordProgress.where("profileId").equals(profileId).delete();
        await db.checkAttempts.where("[profileId+wordId]").between(
          [profileId, ""], [profileId, "\uffff"],
        ).delete();
        await db.sessionHistory.where("[profileId+date]").between(
          [profileId, ""], [profileId, "\uffff"],
        ).delete();
        await db.settings.delete(profileId);
        await db.pets.delete(profileId);
        await db.petEvents.where("[profileId+ts]").between(
          [profileId, ""], [profileId, "\uffff"],
        ).delete();
        await db.shows.where("[profileId+createdAt]").between(
          [profileId, ""], [profileId, "\uffff"],
        ).delete();

        // Bulk insert server data
        if (snap.wordProgress.length > 0)
          await db.wordProgress.bulkPut(snap.wordProgress);
        if (snap.checkAttempts.length > 0)
          await db.checkAttempts.bulkAdd(snap.checkAttempts.map(ca => {
            const { id: _, ...rest } = ca as CheckAttempt & { id?: number };
            return rest;
          }));
        if (snap.sessionHistory.length > 0)
          await db.sessionHistory.bulkAdd(snap.sessionHistory.map(sh => {
            const { id: _, ...rest } = sh as SessionHistoryEntry & { id?: number };
            return rest;
          }));
        if (snap.settings)
          await db.settings.put(snap.settings);
        if (snap.pet)
          await db.pets.put(snap.pet);
        if (snap.petEvents.length > 0)
          await db.petEvents.bulkAdd(snap.petEvents.map(pe => {
            const { id: _, ...rest } = pe as PetEvent & { id?: number };
            return rest;
          }));
        if (snap.shows.length > 0)
          await db.shows.bulkAdd(snap.shows.map(s => {
            const { id: _, ...rest } = s as Show & { id?: number };
            return rest;
          }));
      },
    );

    console.log(`[sync] pulled snapshot for profile ${profileId}: ${snap.wordProgress.length} words`);
    return true;
  } catch (err) {
    console.warn("[sync] pullSnapshot failed, using local data:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Migration — one-time upload of local Dexie data to server
// ---------------------------------------------------------------------------

const MIGRATION_KEY = "childrenStudy.serverMigrationDone";

export async function migrateIfNeeded(): Promise<void> {
  if (localStorage.getItem(MIGRATION_KEY)) return;

  try {
    // Check server health first
    await api.health();
  } catch {
    console.log("[sync] server unreachable, skipping migration");
    return;
  }

  try {
    const localProfiles = await db.profiles.toArray();
    if (localProfiles.length === 0) {
      localStorage.setItem(MIGRATION_KEY, "true");
      return;
    }

    // Check what's already on server
    const serverProfiles = await api.listProfiles();

    for (const lp of localProfiles) {
      // See if this profile name already exists on server
      const existing = serverProfiles.find(
        (sp: Record<string, unknown>) => sp.name === lp.name,
      );

      let serverProfileId: number;

      if (existing) {
        serverProfileId = existing.id as number;
      } else {
        // Create on server
        const created = await api.createProfile({
          name: lp.name,
          avatarEmoji: lp.avatarEmoji,
        });
        serverProfileId = created.id as number;
      }

      // If local profile has a different ID than server, we need to remap
      const localId = lp.id!;

      // Gather all local data
      const wordProgress = await db.wordProgress
        .where("profileId").equals(localId).toArray();
      const checkAttempts = await db.checkAttempts.toArray();
      const filteredAttempts = checkAttempts.filter(ca => ca.profileId === localId);
      const sessionHistory = await db.sessionHistory
        .where("[profileId+date]").between([localId, ""], [localId, "\uffff"]).toArray();
      const settings = await db.settings.get(localId);
      const pet = await db.pets.get(localId);
      const petEvents = await db.petEvents
        .where("[profileId+ts]").between([localId, ""], [localId, "\uffff"]).toArray();
      const shows = await db.shows
        .where("[profileId+createdAt]").between([localId, ""], [localId, "\uffff"]).toArray();

      // Upload snapshot
      await api.putSnapshot(serverProfileId, {
        wordProgress: wordProgress.map(wp => ({ ...wp, profileId: serverProfileId })),
        checkAttempts: filteredAttempts.map(ca => ({ ...ca, profileId: serverProfileId })),
        sessionHistory: sessionHistory.map(sh => ({ ...sh, profileId: serverProfileId })),
        settings: settings ? { ...settings, profileId: serverProfileId } : null,
        pet: pet ? { ...pet, profileId: serverProfileId } : null,
        petEvents: petEvents.map(pe => ({ ...pe, profileId: serverProfileId })),
        shows: shows.map(s => ({ ...s, profileId: serverProfileId })),
      });

      // If server gave a different ID, update local Dexie to match
      if (serverProfileId !== localId) {
        // Update profile ID in local DB to match server
        await db.profiles.update(localId, { id: serverProfileId } as Partial<Profile>);
      }

      console.log(`[sync] migrated profile "${lp.name}" (local=${localId} → server=${serverProfileId})`);
    }

    localStorage.setItem(MIGRATION_KEY, "true");
    console.log("[sync] migration complete");
  } catch (err) {
    console.warn("[sync] migration failed, will retry next launch:", err);
  }
}
