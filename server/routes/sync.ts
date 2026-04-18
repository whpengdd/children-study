// server/routes/sync.ts
//
// Per-table sync endpoints. These are called by the frontend after each
// Dexie write to keep the server in sync (fire-and-forget from client side).

import { Router } from "express";
import { stmts } from "../db.js";

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/profiles/:id/progress — upsert one WordProgress row
// ---------------------------------------------------------------------------
router.post("/:id/progress", (req, res) => {
  const profileId = Number(req.params.id);
  const wp = req.body;
  try {
    stmts.upsertProgress.run({
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
    });
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error("[sync] progress upsert error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/profiles/:id/attempts — append CheckAttempt(s)
// ---------------------------------------------------------------------------
router.post("/:id/attempts", (req, res) => {
  const profileId = Number(req.params.id);
  const items: Record<string, unknown>[] = Array.isArray(req.body) ? req.body : [req.body];
  try {
    for (const ca of items) {
      stmts.insertAttempt.run({
        profile_id: profileId,
        word_id: ca.wordId,
        scenario_index: ca.scenarioIndex,
        tier: ca.tier,
        kind: ca.kind,
        correct: ca.correct ? 1 : 0,
        latency_ms: ca.latencyMs,
        ts: ca.ts,
      });
    }
    res.json({ ok: true, count: items.length });
  } catch (err: unknown) {
    console.error("[sync] attempts insert error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/profiles/:id/settings — upsert settings
// ---------------------------------------------------------------------------
router.put("/:id/settings", (req, res) => {
  const profileId = Number(req.params.id);
  const s = req.body;
  try {
    stmts.upsertSettings.run({
      profile_id: profileId,
      ambient_mode: s.ambientMode ? 1 : 0,
      carousel_speed: s.carouselSpeed ?? "normal",
      voice_accent: s.voiceAccent ?? "us",
      max_new_words: s.maxNewWordsPerSession ?? 10,
      due_lookahead_ms: s.dueLookaheadMs ?? 86400000,
      show_gen_mode: s.showGenerationMode ?? "offline",
      daily_show_quota: s.dailyShowAiQuota ?? 3,
    });
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error("[sync] settings upsert error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/profiles/:id/pet — upsert pet
// ---------------------------------------------------------------------------
router.put("/:id/pet", (req, res) => {
  const profileId = Number(req.params.id);
  const p = req.body;
  try {
    stmts.upsertPet.run({
      profile_id: profileId,
      species: p.species,
      name: p.name,
      stage: p.stage,
      stats: JSON.stringify(p.stats ?? {}),
      skills: JSON.stringify(p.skills ?? []),
      hatched_at: p.hatchedAt,
      last_fed_at: p.lastFedAt,
      last_show_at: p.lastShowAt,
    });
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error("[sync] pet upsert error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/profiles/:id/pet-events — append PetEvent(s)
// ---------------------------------------------------------------------------
router.post("/:id/pet-events", (req, res) => {
  const profileId = Number(req.params.id);
  const items: Record<string, unknown>[] = Array.isArray(req.body) ? req.body : [req.body];
  try {
    for (const pe of items) {
      stmts.insertPetEvent.run({
        profile_id: profileId,
        ts: pe.ts,
        kind: pe.kind,
        payload: JSON.stringify(pe.payload ?? {}),
      });
    }
    res.json({ ok: true, count: items.length });
  } catch (err: unknown) {
    console.error("[sync] pet-events insert error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/profiles/:id/shows — append Show
// ---------------------------------------------------------------------------
router.post("/:id/shows", (req, res) => {
  const profileId = Number(req.params.id);
  const s = req.body;
  try {
    stmts.insertShow.run({
      profile_id: profileId,
      skill_id: s.skillId,
      script: JSON.stringify(s.script ?? []),
      source: s.source,
      created_at: s.createdAt,
    });
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error("[sync] shows insert error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/profiles/:id/sessions — append SessionHistory
// ---------------------------------------------------------------------------
router.post("/:id/sessions", (req, res) => {
  const profileId = Number(req.params.id);
  const sh = req.body;
  try {
    stmts.insertSession.run({
      profile_id: profileId,
      date: sh.date,
      started_at: sh.startedAt,
      ended_at: sh.endedAt,
      items_seen: sh.itemsSeen ?? 0,
      graduations: sh.graduations ?? 0,
      xp_gained: sh.xpGained ?? 0,
    });
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error("[sync] sessions insert error:", err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
