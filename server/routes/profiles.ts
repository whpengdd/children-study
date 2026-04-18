// server/routes/profiles.ts
//
// Profile CRUD + full-snapshot endpoints.

import { Router } from "express";
import { stmts, deleteProfileCascade, importSnapshot } from "../db.js";

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/profiles — list all
// ---------------------------------------------------------------------------
router.get("/", (_req, res) => {
  const rows = stmts.listProfiles.all();
  const profiles = rows.map(toProfile);
  res.json(profiles);
});

// ---------------------------------------------------------------------------
// POST /api/profiles — create
// ---------------------------------------------------------------------------
router.post("/", (req, res) => {
  const { name, avatarEmoji } = req.body;
  if (!name?.trim()) { res.status(400).json({ error: "name required" }); return; }

  const existing = stmts.getProfileByName.get(name.trim());
  if (existing) { res.status(409).json({ error: "duplicate name" }); return; }

  const now = new Date().toISOString();
  const result = stmts.insertProfile.run({
    name: name.trim(),
    avatar_emoji: avatarEmoji?.trim() || "🐱",
    created_at: now,
    last_active_at: now,
    last_path: null,
  });
  const row = stmts.getProfile.get(result.lastInsertRowid);
  res.status(201).json(toProfile(row));
});

// ---------------------------------------------------------------------------
// PATCH /api/profiles/:id — update
// ---------------------------------------------------------------------------
router.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = stmts.getProfile.get(id) as Record<string, unknown> | undefined;
  if (!existing) { res.status(404).json({ error: "not found" }); return; }

  const merged = {
    id,
    name: req.body.name ?? existing.name,
    avatar_emoji: req.body.avatarEmoji ?? existing.avatar_emoji,
    last_active_at: req.body.lastActiveAt ?? new Date().toISOString(),
    last_path: req.body.lastPath !== undefined
      ? (req.body.lastPath ? JSON.stringify(req.body.lastPath) : null)
      : existing.last_path,
  };
  stmts.updateProfile.run(merged);
  const updated = stmts.getProfile.get(id);
  res.json(toProfile(updated));
});

// ---------------------------------------------------------------------------
// DELETE /api/profiles/:id — delete (cascade)
// ---------------------------------------------------------------------------
router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = stmts.getProfile.get(id);
  if (!existing) { res.status(404).json({ error: "not found" }); return; }
  deleteProfileCascade(id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /api/profiles/:id/snapshot — full data dump
// ---------------------------------------------------------------------------
router.get("/:id/snapshot", (req, res) => {
  const id = Number(req.params.id);
  const profile = stmts.getProfile.get(id) as Record<string, unknown> | undefined;
  if (!profile) { res.status(404).json({ error: "not found" }); return; }

  const wordProgress = (stmts.getProgressByProfile.all(id) as Record<string, unknown>[]).map(toWordProgress);
  const checkAttempts = (stmts.getAttemptsByProfile.all(id) as Record<string, unknown>[]).map(toCheckAttempt);
  const sessionHistory = (stmts.getSessionsByProfile.all(id) as Record<string, unknown>[]).map(toSessionHistory);
  const settingsRow = stmts.getSettingsByProfile.get(id) as Record<string, unknown> | undefined;
  const petRow = stmts.getPetByProfile.get(id) as Record<string, unknown> | undefined;
  const petEvents = (stmts.getPetEventsByProfile.all(id) as Record<string, unknown>[]).map(toPetEvent);
  const shows = (stmts.getShowsByProfile.all(id) as Record<string, unknown>[]).map(toShow);

  res.json({
    profile: toProfile(profile),
    wordProgress,
    checkAttempts,
    sessionHistory,
    settings: settingsRow ? toSettings(settingsRow) : null,
    pet: petRow ? toPet(petRow) : null,
    petEvents,
    shows,
  });
});

// ---------------------------------------------------------------------------
// PUT /api/profiles/:id/snapshot — import full data (migration)
// ---------------------------------------------------------------------------
router.put("/:id/snapshot", (req, res) => {
  const id = Number(req.params.id);
  const profile = stmts.getProfile.get(id);
  if (!profile) { res.status(404).json({ error: "not found" }); return; }

  const body = req.body;
  importSnapshot(id, {
    wordProgress: (body.wordProgress ?? []).map((wp: Record<string, unknown>) => toDbProgress(id, wp)),
    checkAttempts: (body.checkAttempts ?? []).map((ca: Record<string, unknown>) => toDbAttempt(id, ca)),
    sessionHistory: (body.sessionHistory ?? []).map((sh: Record<string, unknown>) => toDbSession(id, sh)),
    settings: body.settings ? toDbSettings(id, body.settings) : null,
    pet: body.pet ? toDbPet(id, body.pet) : null,
    petEvents: (body.petEvents ?? []).map((pe: Record<string, unknown>) => toDbPetEvent(id, pe)),
    shows: (body.shows ?? []).map((s: Record<string, unknown>) => toDbShow(id, s)),
  });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Row → API shape converters (snake_case DB → camelCase API)
// ---------------------------------------------------------------------------

function toProfile(row: unknown): Record<string, unknown> {
  const r = row as Record<string, unknown>;
  return {
    id: r.id,
    name: r.name,
    avatarEmoji: r.avatar_emoji,
    createdAt: r.created_at,
    lastActiveAt: r.last_active_at,
    lastPath: r.last_path ? JSON.parse(r.last_path as string) : undefined,
  };
}

function toWordProgress(r: Record<string, unknown>) {
  return {
    profileId: r.profile_id,
    wordId: r.word_id,
    tier: r.tier,
    scenarioIndex: r.scenario_index,
    tierAttempts: JSON.parse(r.tier_attempts as string),
    tierWrongs: JSON.parse(r.tier_wrongs as string),
    firstSeenAt: r.first_seen_at,
    lastSeenAt: r.last_seen_at,
    lastAdvancedAt: r.last_advanced_at,
    fsrsCard: JSON.parse(r.fsrs_card as string),
    fsrsDue: r.fsrs_due,
    totalGraduations: r.total_graduations,
    totalLapses: r.total_lapses,
  };
}

function toCheckAttempt(r: Record<string, unknown>) {
  return {
    id: r.id,
    profileId: r.profile_id,
    wordId: r.word_id,
    scenarioIndex: r.scenario_index,
    tier: r.tier,
    kind: r.kind,
    correct: r.correct === 1,
    latencyMs: r.latency_ms,
    ts: r.ts,
  };
}

function toSessionHistory(r: Record<string, unknown>) {
  return {
    id: r.id,
    profileId: r.profile_id,
    date: r.date,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    itemsSeen: r.items_seen,
    graduations: r.graduations,
    xpGained: r.xp_gained,
  };
}

function toSettings(r: Record<string, unknown>) {
  return {
    profileId: r.profile_id,
    ambientMode: r.ambient_mode === 1,
    carouselSpeed: r.carousel_speed,
    voiceAccent: r.voice_accent,
    maxNewWordsPerSession: r.max_new_words,
    dueLookaheadMs: r.due_lookahead_ms,
    showGenerationMode: r.show_gen_mode,
    dailyShowAiQuota: r.daily_show_quota,
  };
}

function toPet(r: Record<string, unknown>) {
  return {
    profileId: r.profile_id,
    species: r.species,
    name: r.name,
    stage: r.stage,
    stats: JSON.parse(r.stats as string),
    skills: JSON.parse(r.skills as string),
    hatchedAt: r.hatched_at,
    lastFedAt: r.last_fed_at,
    lastShowAt: r.last_show_at,
  };
}

function toPetEvent(r: Record<string, unknown>) {
  return {
    id: r.id,
    profileId: r.profile_id,
    ts: r.ts,
    kind: r.kind,
    payload: JSON.parse(r.payload as string),
  };
}

function toShow(r: Record<string, unknown>) {
  return {
    id: r.id,
    profileId: r.profile_id,
    skillId: r.skill_id,
    script: JSON.parse(r.script as string),
    source: r.source,
    createdAt: r.created_at,
  };
}

// ---------------------------------------------------------------------------
// API shape → DB row converters (camelCase API → snake_case DB)
// ---------------------------------------------------------------------------

function toDbProgress(profileId: number, wp: Record<string, unknown>) {
  return {
    profile_id: profileId,
    word_id: wp.wordId,
    tier: wp.tier,
    scenario_index: wp.scenarioIndex,
    tier_attempts: JSON.stringify(wp.tierAttempts ?? [0, 0, 0, 0]),
    tier_wrongs: JSON.stringify(wp.tierWrongs ?? [0, 0, 0, 0]),
    first_seen_at: wp.firstSeenAt,
    last_seen_at: wp.lastSeenAt,
    last_advanced_at: wp.lastAdvancedAt,
    fsrs_card: JSON.stringify(wp.fsrsCard ?? {}),
    fsrs_due: wp.fsrsDue ?? 0,
    total_graduations: wp.totalGraduations ?? 0,
    total_lapses: wp.totalLapses ?? 0,
  };
}

function toDbAttempt(profileId: number, ca: Record<string, unknown>) {
  return {
    profile_id: profileId,
    word_id: ca.wordId,
    scenario_index: ca.scenarioIndex,
    tier: ca.tier,
    kind: ca.kind,
    correct: ca.correct ? 1 : 0,
    latency_ms: ca.latencyMs,
    ts: ca.ts,
  };
}

function toDbSession(profileId: number, sh: Record<string, unknown>) {
  return {
    profile_id: profileId,
    date: sh.date,
    started_at: sh.startedAt,
    ended_at: sh.endedAt,
    items_seen: sh.itemsSeen ?? 0,
    graduations: sh.graduations ?? 0,
    xp_gained: sh.xpGained ?? 0,
  };
}

function toDbSettings(profileId: number, s: Record<string, unknown>) {
  return {
    profile_id: profileId,
    ambient_mode: s.ambientMode ? 1 : 0,
    carousel_speed: s.carouselSpeed ?? "normal",
    voice_accent: s.voiceAccent ?? "us",
    max_new_words: s.maxNewWordsPerSession ?? 10,
    due_lookahead_ms: s.dueLookaheadMs ?? 86400000,
    show_gen_mode: s.showGenerationMode ?? "offline",
    daily_show_quota: s.dailyShowAiQuota ?? 3,
  };
}

function toDbPet(profileId: number, p: Record<string, unknown>) {
  return {
    profile_id: profileId,
    species: p.species,
    name: p.name,
    stage: p.stage,
    stats: JSON.stringify(p.stats ?? {}),
    skills: JSON.stringify(p.skills ?? []),
    hatched_at: p.hatchedAt,
    last_fed_at: p.lastFedAt,
    last_show_at: p.lastShowAt,
  };
}

function toDbPetEvent(profileId: number, pe: Record<string, unknown>) {
  return {
    profile_id: profileId,
    ts: pe.ts,
    kind: pe.kind,
    payload: JSON.stringify(pe.payload ?? {}),
  };
}

function toDbShow(profileId: number, s: Record<string, unknown>) {
  return {
    profile_id: profileId,
    skill_id: s.skillId,
    script: JSON.stringify(s.script ?? []),
    source: s.source,
    created_at: s.createdAt,
  };
}

export default router;
