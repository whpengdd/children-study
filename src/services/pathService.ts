// src/services/pathService.ts
//
// Persist the child's currently selected LearningPath on the Profile row so
// ProfileGate can fast-forward to /study next time they open the app.

import { db } from "../data/db";
import type { LearningPath } from "../types/path";

/**
 * Atomically updates `profile.lastPath`. If the profile doesn't exist we
 * throw so the caller notices — a missing profile at this point is almost
 * certainly a bug upstream (e.g. deleted mid-session).
 */
export async function setCurrentPath(
  profileId: number,
  path: LearningPath,
): Promise<void> {
  const existing = await db.profiles.get(profileId);
  if (!existing) throw new Error(`profile ${profileId} not found`);
  await db.profiles.update(profileId, {
    lastPath: path,
    lastActiveAt: new Date().toISOString(),
  });
}

/** Returns the stored path or `null` if this profile has never chosen one. */
export async function getCurrentPath(
  profileId: number,
): Promise<LearningPath | null> {
  const existing = await db.profiles.get(profileId);
  return existing?.lastPath ?? null;
}
