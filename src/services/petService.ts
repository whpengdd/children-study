// src/services/petService.ts
//
// The Tamagotchi layer. One-way coupled to learning: StudyScreen (Wave 2)
// calls `rewardFromLearning(profileId, event)` after progressService moves
// forward; this file never reads WordProgress directly except via the helper
// countGraduations. Internal logic is factored into pure helpers so the unit
// tests in src/services/__tests__/pet.test.ts can hit it without Dexie.

import { db } from "../data/db";
import type {
  LearningRewardEvent,
  Pet,
  PetRewardResult,
  PetSkill,
  PetSpecies,
  PetStage,
  PetStats,
} from "../types";

// ---------------------------------------------------------------------------
// XP / stat reward table
// ---------------------------------------------------------------------------

/**
 * Mapping from learning-reward-event kind to XP + stat deltas.
 *
 * Plan uses names like `exposure` / `tier4_rollback`; the actual
 * LearningRewardEvent tagged union uses `tier1_exposure` / `tier4_wrong_fall`.
 * We key by the ACTUAL event `kind` string. The `tier4_correct` entry is only
 * reached when `graduated === true`; non-graduating Tier 4 correct answers
 * (which shouldn't normally happen, but see plan §tier4) fall through to
 * XP_TABLE.tier4_correct anyway — a Tier 4 correct is always a big reward.
 */
export interface RewardDelta {
  xp: number;
  hunger: number;
  happiness: number;
  energy: number;
}

export const XP_TABLE: Record<LearningRewardEvent["kind"], RewardDelta> = {
  tier1_exposure:   { xp: 1,  hunger: 0,  happiness: 1,  energy: 0  },
  tier2_correct:    { xp: 3,  hunger: -1, happiness: 2,  energy: 0  },
  tier2_wrong:      { xp: 0,  hunger: 0,  happiness: -1, energy: 0  },
  tier3_correct:    { xp: 5,  hunger: -2, happiness: 3,  energy: 0  },
  tier3_wrong:      { xp: 0,  hunger: 0,  happiness: 0,  energy: -2 },
  tier4_correct:    { xp: 10, hunger: 0,  happiness: 10, energy: 5  },
  tier4_wrong_fall: { xp: 0,  hunger: 0,  happiness: -3, energy: 0  },
  review_correct:   { xp: 2,  hunger: 0,  happiness: 1,  energy: 0  },
  review_wrong:     { xp: 0,  hunger: 0,  happiness: -2, energy: 0  },
};

// ---------------------------------------------------------------------------
// Skill catalog — master list. Ordered roughly by unlock threshold.
// ---------------------------------------------------------------------------

/**
 * A "locked" skill template. A skill moves from here onto `Pet.skills` as the
 * child hits its unlock threshold.  `stageRequired` enforces the dual-gate:
 * some skills only become available after the pet reaches a particular stage,
 * independent of how many words have graduated.
 */
interface SkillCatalogEntry {
  id: string;
  name: string;
  unlockAt: number;
  kind: PetSkill["kind"];
  /** Optional — when present, the pet must be at or beyond this stage. */
  stageRequired?: PetStage;
}

export const SKILL_CATALOG: SkillCatalogEntry[] = [
  {
    id: "alphabet_song",
    name: "字母大合唱",
    unlockAt: 0,
    kind: "song",
    stageRequired: "baby",
  },
  { id: "count_1_10",         name: "数数 1-10",        unlockAt: 10,  kind: "trick" },
  { id: "color_dance",        name: "颜色舞蹈",         unlockAt: 20,  kind: "dance" },
  { id: "animal_parade",      name: "动物游行",         unlockAt: 20,  kind: "dance" },
  {
    id: "storytelling_basic",
    name: "小小故事家",
    unlockAt: 50,
    kind: "story",
    stageRequired: "teen",
  },
  { id: "ket_warmup_quiz",    name: "KET 小考官",       unlockAt: 80,  kind: "trick" },
  { id: "story_personalized", name: "专属故事",         unlockAt: 100, kind: "story" },
];

/** Order used when comparing stages for "at or beyond". */
const STAGE_ORDER: PetStage[] = ["egg", "baby", "child", "teen", "adult"];
function stageAtLeast(current: PetStage, required: PetStage): boolean {
  return STAGE_ORDER.indexOf(current) >= STAGE_ORDER.indexOf(required);
}

// ---------------------------------------------------------------------------
// Pure helpers — exported for tests
// ---------------------------------------------------------------------------

/** Clamp a stat into the [0, 100] interval. */
export function clampStat(n: number): number {
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

/**
 * Apply an event's reward delta to a stats object in place. Returns the new
 * stats (same object) so callers can chain.
 *
 * knowledgeXp is monotonic — we never subtract, even if the delta is zero or
 * negative (it never is in XP_TABLE, but we're defensive).
 */
export function applyReward(
  stats: PetStats,
  eventKind: LearningRewardEvent["kind"],
): PetStats {
  const d = XP_TABLE[eventKind];
  stats.knowledgeXp = stats.knowledgeXp + Math.max(0, d.xp);
  stats.hunger = clampStat(stats.hunger + d.hunger);
  stats.happiness = clampStat(stats.happiness + d.happiness);
  stats.energy = clampStat(stats.energy + d.energy);
  return stats;
}

/**
 * Decide the stage given accumulated XP and graduated-word count.
 *
 * Dual-threshold rules (plan §进化阶段门槛):
 *   egg   → baby:  xp ≥ 30
 *   baby  → child: xp ≥ 150  AND graduated ≥ 10
 *   child → teen:  xp ≥ 500  AND graduated ≥ 50
 *   teen  → adult: xp ≥ 2000 AND graduated ≥ 200
 *
 * Stage only moves forward; callers must never use this to downgrade a pet.
 */
export function computeStage(
  xp: number,
  graduatedCount: number,
): PetStage {
  if (xp >= 2000 && graduatedCount >= 200) return "adult";
  if (xp >= 500  && graduatedCount >= 50)  return "teen";
  if (xp >= 150  && graduatedCount >= 10)  return "child";
  if (xp >= 30)                            return "baby";
  return "egg";
}

/**
 * Produce the new list of skills for a pet, given its current skills, stage,
 * and graduated count. Returns *only the newly unlocked* skills — callers can
 * concat these onto `pet.skills`.
 */
export function unlockSkills(
  pet: Pet,
  graduatedCount: number,
): PetSkill[] {
  // Egg-stage pets never have skills — the pet has to hatch first. This is
  // the simplest way to implement the plan's "avoid刷XP升阶" rule: no skills
  // before any meaningful learning has happened.
  if (pet.stage === "egg") return [];

  const haveIds = new Set(pet.skills.map((s) => s.id));
  const nowIso = new Date().toISOString();
  const unlocked: PetSkill[] = [];
  for (const entry of SKILL_CATALOG) {
    if (haveIds.has(entry.id)) continue;
    if (entry.stageRequired && !stageAtLeast(pet.stage, entry.stageRequired)) continue;
    if (graduatedCount < entry.unlockAt) continue;
    unlocked.push({
      id: entry.id,
      name: entry.name,
      unlockAt: entry.unlockAt,
      kind: entry.kind,
      unlockedAt: nowIso,
    });
  }
  return unlocked;
}

/**
 * Hunger/happiness/energy lightly decay over idle days. Returns new stats;
 * never touches knowledgeXp or stage. Pure function so tests can hit it.
 *
 * Decay per day: hunger -5, happiness -3, energy -2. Capped at `maxDays` to
 * keep a week-long-idle pet still alive-ish.
 */
export function decayStats(
  stats: PetStats,
  elapsedDays: number,
  maxDays = 7,
): PetStats {
  const days = Math.max(0, Math.min(elapsedDays, maxDays));
  return {
    hunger: clampStat(stats.hunger - 5 * days),
    happiness: clampStat(stats.happiness - 3 * days),
    energy: clampStat(stats.energy - 2 * days),
    knowledgeXp: stats.knowledgeXp,
  };
}

// ---------------------------------------------------------------------------
// DB-touching functions
// ---------------------------------------------------------------------------

function freshStats(): PetStats {
  return { hunger: 80, happiness: 80, energy: 80, knowledgeXp: 0 };
}

/**
 * Create a pet for a profile. Fails if one already exists — caller should
 * delete first if they want to re-hatch.
 */
export async function hatchPet(
  profileId: number,
  species: PetSpecies,
  name: string,
): Promise<Pet> {
  const existing = await db.pets.get(profileId);
  if (existing) return existing;

  const nowIso = new Date().toISOString();
  const pet: Pet = {
    profileId,
    species,
    name,
    stage: "egg",
    stats: freshStats(),
    skills: [],
    hatchedAt: nowIso,
    lastFedAt: nowIso,
    lastShowAt: nowIso,
  };
  await db.pets.put(pet);
  await db.petEvents.add({
    profileId,
    ts: nowIso,
    kind: "feed",
    payload: { reason: "hatch", species, name },
  });
  return pet;
}

export async function getPet(profileId: number): Promise<Pet | undefined> {
  return db.pets.get(profileId);
}

export async function listPets(): Promise<Pet[]> {
  return db.pets.toArray();
}

export async function deletePet(profileId: number): Promise<void> {
  await db.pets.delete(profileId);
}

/**
 * Count how many words have graduated for a profile. A word is "graduated"
 * when its `WordProgress.tier === 5` — this mirrors the plan's definition
 * and is what drives dual-threshold stage advancement.
 */
export async function countGraduations(profileId: number): Promise<number> {
  // [profileId+tier] is a compound index declared in db.ts.
  return db.wordProgress
    .where("[profileId+tier]")
    .equals([profileId, 5])
    .count();
}

/**
 * The workhorse. Applies a LearningRewardEvent to the pet, persists, emits
 * events, and returns a compact result the UI can celebrate with.
 *
 * Idempotency is the CALLER'S responsibility — progressService already uses
 * `seenInSession` to dedupe exposures, and submitCheck is naturally unique
 * per attempt. If there is no pet for this profile, we silently no-op and
 * return zeros; the learning flow must never block on a missing pet.
 */
export async function rewardFromLearning(
  profileId: number,
  event: LearningRewardEvent,
): Promise<PetRewardResult> {
  const pet = await db.pets.get(profileId);
  if (!pet) {
    return { xpGained: 0, stageChanged: false, skillsUnlocked: [] };
  }

  const delta = XP_TABLE[event.kind];
  const xpGained = Math.max(0, delta.xp);

  applyReward(pet.stats, event.kind);

  const graduations = await countGraduations(profileId);

  const previousStage = pet.stage;
  const newStage = computeStage(pet.stats.knowledgeXp, graduations);
  // Stage never downgrades.
  if (STAGE_ORDER.indexOf(newStage) > STAGE_ORDER.indexOf(previousStage)) {
    pet.stage = newStage;
  }
  const stageChanged = pet.stage !== previousStage;

  const skillsUnlocked = unlockSkills(pet, graduations);
  if (skillsUnlocked.length > 0) {
    pet.skills = [...pet.skills, ...skillsUnlocked];
  }

  const nowIso = new Date().toISOString();
  pet.lastFedAt = nowIso;
  await db.pets.put(pet);

  // Event log — one `feed` per reward, plus an `evolve` / `unlock_skill`
  // when milestones crossed. Keeps the parent-audit story sane.
  await db.petEvents.add({
    profileId,
    ts: nowIso,
    kind: "feed",
    payload: {
      event,
      xpGained,
      delta,
    },
  });
  if (stageChanged) {
    await db.petEvents.add({
      profileId,
      ts: nowIso,
      kind: "evolve",
      payload: { previousStage, newStage: pet.stage },
    });
  }
  for (const s of skillsUnlocked) {
    await db.petEvents.add({
      profileId,
      ts: nowIso,
      kind: "unlock_skill",
      payload: { skillId: s.id, name: s.name },
    });
  }

  return { xpGained, stageChanged, skillsUnlocked };
}

/**
 * Decay a pet's soft stats. Called on profile switch / app open from Wave 2.
 * Never touches stage (stage only goes forward).
 */
export async function applyStatDecay(profileId: number): Promise<Pet | undefined> {
  const pet = await db.pets.get(profileId);
  if (!pet) return undefined;

  const last = new Date(pet.lastFedAt).getTime();
  const now = Date.now();
  const elapsedMs = now - last;
  if (elapsedMs < 0) return pet;
  const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
  if (elapsedDays <= 0) return pet;

  pet.stats = decayStats(pet.stats, elapsedDays);
  const nowIso = new Date().toISOString();
  pet.lastFedAt = nowIso;
  await db.pets.put(pet);
  await db.petEvents.add({
    profileId,
    ts: nowIso,
    kind: "stat_decay",
    payload: { elapsedDays },
  });
  return pet;
}
