// src/data/db.ts
//
// Dexie (IndexedDB) schema for every table the app persists. Structured to
// match the v3 data model exactly; per-profile isolation is enforced via
// compound indices that always lead with `profileId`.

import Dexie, { type Table } from "dexie";

import type {
  CheckAttempt,
  Pet,
  PetEvent,
  Profile,
  Settings,
  Show,
  WordProgress,
} from "../types";

/** Summary record written once per session, used by the Stats screen. */
export interface SessionHistoryEntry {
  id?: number;
  profileId: number;
  /** "YYYY-MM-DD" local date (used as part of the index key). */
  date: string;
  startedAt: string;
  endedAt: string;
  /** Number of items consumed this session (reviews + drips + fresh). */
  itemsSeen: number;
  /** Words that hit Tier 5 during this session. */
  graduations: number;
  /** Total XP the child earned for the pet. */
  xpGained: number;
}

class ChildrenStudyDB extends Dexie {
  profiles!:       Table<Profile, number>;
  wordProgress!:   Table<WordProgress, [number, string]>;
  checkAttempts!:  Table<CheckAttempt, number>;
  sessionHistory!: Table<SessionHistoryEntry, number>;
  settings!:       Table<Settings, number>;
  pets!:           Table<Pet, number>;
  petEvents!:      Table<PetEvent, number>;
  shows!:          Table<Show, number>;

  constructor() {
    super("children-study");

    // Schema string EXACTLY matches the v3 plan.
    this.version(1).stores({
      profiles:       "++id, name",
      wordProgress:   "[profileId+wordId], profileId, [profileId+tier], [profileId+fsrsDue], [profileId+lastSeenAt]",
      checkAttempts:  "++id, [profileId+wordId], [profileId+wordId+ts]",
      sessionHistory: "++id, [profileId+date]",
      settings:       "profileId",
      pets:           "profileId",
      petEvents:      "++id, [profileId+ts]",
      shows:          "++id, [profileId+createdAt]",
    });
  }
}

export const db = new ChildrenStudyDB();
