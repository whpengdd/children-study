// src/types/profile.ts
//
// Each child on the pad has their own Profile. Progress, pet, and settings are
// all keyed off `profileId`.

import type { LearningPath } from "./path";

export interface Profile {
  /** Dexie auto-increment primary key. Optional only before the row is saved. */
  id?: number;
  name: string;
  /** Single-emoji avatar, e.g. "🐱". */
  avatarEmoji: string;
  createdAt: string;
  lastActiveAt: string;
  /** The path this child last studied, so ProfileGate can fast-forward. */
  lastPath?: LearningPath;
}
