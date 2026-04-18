// server/db.ts
//
// SQLite database layer using better-sqlite3.
// Auto-creates the DB file + tables on first import.
// WAL mode for concurrent read performance.

import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.resolve(__dirname, "data");
const DB_PATH = path.join(DB_DIR, "children-study.db");

// Ensure data directory exists
import fs from "fs";
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// ---------------------------------------------------------------------------
// Schema initialization
// ---------------------------------------------------------------------------

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    avatar_emoji TEXT NOT NULL DEFAULT '🐱',
    created_at TEXT NOT NULL,
    last_active_at TEXT NOT NULL,
    last_path TEXT
  );

  CREATE TABLE IF NOT EXISTS word_progress (
    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    word_id TEXT NOT NULL,
    tier INTEGER NOT NULL DEFAULT 1,
    scenario_index INTEGER NOT NULL DEFAULT 0,
    tier_attempts TEXT NOT NULL DEFAULT '[0,0,0,0]',
    tier_wrongs TEXT NOT NULL DEFAULT '[0,0,0,0]',
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    last_advanced_at TEXT NOT NULL,
    fsrs_card TEXT NOT NULL,
    fsrs_due INTEGER NOT NULL,
    total_graduations INTEGER NOT NULL DEFAULT 0,
    total_lapses INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (profile_id, word_id)
  );

  CREATE TABLE IF NOT EXISTS check_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    word_id TEXT NOT NULL,
    scenario_index INTEGER NOT NULL,
    tier INTEGER NOT NULL,
    kind TEXT NOT NULL,
    correct INTEGER NOT NULL,
    latency_ms INTEGER NOT NULL,
    ts TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS session_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT NOT NULL,
    items_seen INTEGER NOT NULL DEFAULT 0,
    graduations INTEGER NOT NULL DEFAULT 0,
    xp_gained INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS settings (
    profile_id INTEGER PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    ambient_mode INTEGER NOT NULL DEFAULT 0,
    carousel_speed TEXT NOT NULL DEFAULT 'normal',
    voice_accent TEXT NOT NULL DEFAULT 'us',
    max_new_words INTEGER NOT NULL DEFAULT 10,
    due_lookahead_ms INTEGER NOT NULL DEFAULT 86400000,
    show_gen_mode TEXT NOT NULL DEFAULT 'offline',
    daily_show_quota INTEGER NOT NULL DEFAULT 3
  );

  CREATE TABLE IF NOT EXISTS pets (
    profile_id INTEGER PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    species TEXT NOT NULL,
    name TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'egg',
    stats TEXT NOT NULL,
    skills TEXT NOT NULL DEFAULT '[]',
    hatched_at TEXT NOT NULL,
    last_fed_at TEXT NOT NULL,
    last_show_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pet_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    ts TEXT NOT NULL,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS shows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    skill_id TEXT NOT NULL,
    script TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// Create indexes (IF NOT EXISTS for idempotence)
sqlite.exec(`
  CREATE INDEX IF NOT EXISTS idx_wp_tier ON word_progress(profile_id, tier);
  CREATE INDEX IF NOT EXISTS idx_wp_due ON word_progress(profile_id, fsrs_due);
  CREATE INDEX IF NOT EXISTS idx_ca_pw ON check_attempts(profile_id, word_id);
  CREATE INDEX IF NOT EXISTS idx_sh_pd ON session_history(profile_id, date);
  CREATE INDEX IF NOT EXISTS idx_pe_pt ON pet_events(profile_id, ts);
  CREATE INDEX IF NOT EXISTS idx_shows_pc ON shows(profile_id, created_at);
`);

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------

// -- Profiles
export const stmts = {
  listProfiles: sqlite.prepare(`SELECT * FROM profiles ORDER BY last_active_at DESC`),
  getProfile: sqlite.prepare(`SELECT * FROM profiles WHERE id = ?`),
  getProfileByName: sqlite.prepare(`SELECT * FROM profiles WHERE name = ?`),
  insertProfile: sqlite.prepare(`
    INSERT INTO profiles (name, avatar_emoji, created_at, last_active_at, last_path)
    VALUES (@name, @avatar_emoji, @created_at, @last_active_at, @last_path)
  `),
  updateProfile: sqlite.prepare(`
    UPDATE profiles SET name = @name, avatar_emoji = @avatar_emoji,
      last_active_at = @last_active_at, last_path = @last_path
    WHERE id = @id
  `),
  deleteProfile: sqlite.prepare(`DELETE FROM profiles WHERE id = ?`),

  // -- WordProgress
  upsertProgress: sqlite.prepare(`
    INSERT INTO word_progress (
      profile_id, word_id, tier, scenario_index,
      tier_attempts, tier_wrongs,
      first_seen_at, last_seen_at, last_advanced_at,
      fsrs_card, fsrs_due, total_graduations, total_lapses
    ) VALUES (
      @profile_id, @word_id, @tier, @scenario_index,
      @tier_attempts, @tier_wrongs,
      @first_seen_at, @last_seen_at, @last_advanced_at,
      @fsrs_card, @fsrs_due, @total_graduations, @total_lapses
    ) ON CONFLICT(profile_id, word_id) DO UPDATE SET
      tier = @tier, scenario_index = @scenario_index,
      tier_attempts = @tier_attempts, tier_wrongs = @tier_wrongs,
      last_seen_at = @last_seen_at, last_advanced_at = @last_advanced_at,
      fsrs_card = @fsrs_card, fsrs_due = @fsrs_due,
      total_graduations = @total_graduations, total_lapses = @total_lapses
  `),
  getProgressByProfile: sqlite.prepare(`SELECT * FROM word_progress WHERE profile_id = ?`),
  deleteProgressByProfile: sqlite.prepare(`DELETE FROM word_progress WHERE profile_id = ?`),

  // -- CheckAttempts
  insertAttempt: sqlite.prepare(`
    INSERT INTO check_attempts (profile_id, word_id, scenario_index, tier, kind, correct, latency_ms, ts)
    VALUES (@profile_id, @word_id, @scenario_index, @tier, @kind, @correct, @latency_ms, @ts)
  `),
  getAttemptsByProfile: sqlite.prepare(`SELECT * FROM check_attempts WHERE profile_id = ? ORDER BY ts`),
  deleteAttemptsByProfile: sqlite.prepare(`DELETE FROM check_attempts WHERE profile_id = ?`),

  // -- SessionHistory
  insertSession: sqlite.prepare(`
    INSERT INTO session_history (profile_id, date, started_at, ended_at, items_seen, graduations, xp_gained)
    VALUES (@profile_id, @date, @started_at, @ended_at, @items_seen, @graduations, @xp_gained)
  `),
  getSessionsByProfile: sqlite.prepare(`SELECT * FROM session_history WHERE profile_id = ? ORDER BY date`),
  deleteSessionsByProfile: sqlite.prepare(`DELETE FROM session_history WHERE profile_id = ?`),

  // -- Settings
  upsertSettings: sqlite.prepare(`
    INSERT INTO settings (profile_id, ambient_mode, carousel_speed, voice_accent, max_new_words, due_lookahead_ms, show_gen_mode, daily_show_quota)
    VALUES (@profile_id, @ambient_mode, @carousel_speed, @voice_accent, @max_new_words, @due_lookahead_ms, @show_gen_mode, @daily_show_quota)
    ON CONFLICT(profile_id) DO UPDATE SET
      ambient_mode = @ambient_mode, carousel_speed = @carousel_speed,
      voice_accent = @voice_accent, max_new_words = @max_new_words,
      due_lookahead_ms = @due_lookahead_ms, show_gen_mode = @show_gen_mode,
      daily_show_quota = @daily_show_quota
  `),
  getSettingsByProfile: sqlite.prepare(`SELECT * FROM settings WHERE profile_id = ?`),
  deleteSettingsByProfile: sqlite.prepare(`DELETE FROM settings WHERE profile_id = ?`),

  // -- Pets
  upsertPet: sqlite.prepare(`
    INSERT INTO pets (profile_id, species, name, stage, stats, skills, hatched_at, last_fed_at, last_show_at)
    VALUES (@profile_id, @species, @name, @stage, @stats, @skills, @hatched_at, @last_fed_at, @last_show_at)
    ON CONFLICT(profile_id) DO UPDATE SET
      species = @species, name = @name, stage = @stage,
      stats = @stats, skills = @skills,
      last_fed_at = @last_fed_at, last_show_at = @last_show_at
  `),
  getPetByProfile: sqlite.prepare(`SELECT * FROM pets WHERE profile_id = ?`),
  deletePetByProfile: sqlite.prepare(`DELETE FROM pets WHERE profile_id = ?`),

  // -- PetEvents
  insertPetEvent: sqlite.prepare(`
    INSERT INTO pet_events (profile_id, ts, kind, payload)
    VALUES (@profile_id, @ts, @kind, @payload)
  `),
  getPetEventsByProfile: sqlite.prepare(`SELECT * FROM pet_events WHERE profile_id = ? ORDER BY ts`),
  deletePetEventsByProfile: sqlite.prepare(`DELETE FROM pet_events WHERE profile_id = ?`),

  // -- Shows
  insertShow: sqlite.prepare(`
    INSERT INTO shows (profile_id, skill_id, script, source, created_at)
    VALUES (@profile_id, @skill_id, @script, @source, @created_at)
  `),
  getShowsByProfile: sqlite.prepare(`SELECT * FROM shows WHERE profile_id = ? ORDER BY created_at`),
  deleteShowsByProfile: sqlite.prepare(`DELETE FROM shows WHERE profile_id = ?`),
};

// ---------------------------------------------------------------------------
// Transaction helpers
// ---------------------------------------------------------------------------

/** Delete a profile and all its related data (cascade via FK). */
export const deleteProfileCascade = sqlite.transaction((profileId: number) => {
  stmts.deleteProgressByProfile.run(profileId);
  stmts.deleteAttemptsByProfile.run(profileId);
  stmts.deleteSessionsByProfile.run(profileId);
  stmts.deleteSettingsByProfile.run(profileId);
  stmts.deletePetByProfile.run(profileId);
  stmts.deletePetEventsByProfile.run(profileId);
  stmts.deleteShowsByProfile.run(profileId);
  stmts.deleteProfile.run(profileId);
});

/** Import a full profile snapshot (used for migration). Replaces all existing data for the profile. */
export const importSnapshot = sqlite.transaction((profileId: number, data: {
  wordProgress: Record<string, unknown>[];
  checkAttempts: Record<string, unknown>[];
  sessionHistory: Record<string, unknown>[];
  settings: Record<string, unknown> | null;
  pet: Record<string, unknown> | null;
  petEvents: Record<string, unknown>[];
  shows: Record<string, unknown>[];
}) => {
  // Clear existing data for this profile
  stmts.deleteProgressByProfile.run(profileId);
  stmts.deleteAttemptsByProfile.run(profileId);
  stmts.deleteSessionsByProfile.run(profileId);
  stmts.deleteSettingsByProfile.run(profileId);
  stmts.deletePetByProfile.run(profileId);
  stmts.deletePetEventsByProfile.run(profileId);
  stmts.deleteShowsByProfile.run(profileId);

  // Import word progress
  for (const wp of data.wordProgress) {
    stmts.upsertProgress.run(wp);
  }

  // Import check attempts
  for (const ca of data.checkAttempts) {
    stmts.insertAttempt.run(ca);
  }

  // Import session history
  for (const sh of data.sessionHistory) {
    stmts.insertSession.run(sh);
  }

  // Import settings
  if (data.settings) {
    stmts.upsertSettings.run(data.settings);
  }

  // Import pet
  if (data.pet) {
    stmts.upsertPet.run(data.pet);
  }

  // Import pet events
  for (const pe of data.petEvents) {
    stmts.insertPetEvent.run(pe);
  }

  // Import shows
  for (const s of data.shows) {
    stmts.insertShow.run(s);
  }
});

export default sqlite;
