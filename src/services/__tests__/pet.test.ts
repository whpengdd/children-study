// src/services/__tests__/pet.test.ts
//
// Pure-function unit tests for petService + templateLoader. Runs via
//   npx tsx src/services/__tests__/pet.test.ts
//
// Deliberately avoids touching Dexie — all DB-facing helpers in petService
// are left alone and only the pure helpers (XP_TABLE, applyReward,
// computeStage, unlockSkills, decayStats, clampStat) are exercised.
//
// Uses a hand-rolled assertion harness to keep zero external test deps.

import {
  applyReward,
  clampStat,
  computeStage,
  decayStats,
  unlockSkills,
  XP_TABLE,
} from "../petService";
import {
  renderTemplate,
  type ShowTemplateVariant,
} from "../../data/templateLoader";
import type { Pet, PetSkill, PetStats } from "../../types";

// ---------------------------------------------------------------------------
// Minimal test harness (no deps)
// ---------------------------------------------------------------------------

interface TestCase {
  name: string;
  fn: () => void;
}

const tests: TestCase[] = [];
function test(name: string, fn: () => void): void {
  tests.push({ name, fn });
}

class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertionError";
  }
}

function assertEqual<T>(actual: T, expected: T, label = ""): void {
  const ok =
    typeof expected === "object" && expected !== null
      ? JSON.stringify(actual) === JSON.stringify(expected)
      : actual === expected;
  if (!ok) {
    throw new AssertionError(
      `${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(
        actual,
      )}`,
    );
  }
}

function assert(cond: boolean, label = ""): void {
  if (!cond) throw new AssertionError(`Assertion failed: ${label}`);
}

function makeStats(overrides: Partial<PetStats> = {}): PetStats {
  return {
    hunger: 80,
    happiness: 80,
    energy: 80,
    knowledgeXp: 0,
    ...overrides,
  };
}

function makePet(overrides: Partial<Pet> = {}): Pet {
  const nowIso = new Date().toISOString();
  return {
    profileId: 1,
    species: "cat",
    name: "Whiskers",
    stage: "egg",
    stats: makeStats(),
    skills: [],
    hatchedAt: nowIso,
    lastFedAt: nowIso,
    lastShowAt: nowIso,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// clampStat
// ---------------------------------------------------------------------------

test("clampStat: lower bound", () => {
  assertEqual(clampStat(-5), 0, "clampStat(-5)");
  assertEqual(clampStat(0), 0, "clampStat(0)");
});

test("clampStat: upper bound", () => {
  assertEqual(clampStat(100), 100, "clampStat(100)");
  assertEqual(clampStat(250), 100, "clampStat(250)");
});

test("clampStat: passthrough", () => {
  assertEqual(clampStat(42), 42, "clampStat(42)");
});

// ---------------------------------------------------------------------------
// XP_TABLE coverage
// ---------------------------------------------------------------------------

test("XP_TABLE: tier1_exposure gives +1 XP and +1 happiness", () => {
  const d = XP_TABLE.tier1_exposure;
  assertEqual(d.xp, 1);
  assertEqual(d.happiness, 1);
  assertEqual(d.hunger, 0);
  assertEqual(d.energy, 0);
});

test("XP_TABLE: tier2_correct gives +3 XP and -1 hunger", () => {
  const d = XP_TABLE.tier2_correct;
  assertEqual(d.xp, 3);
  assertEqual(d.hunger, -1);
  assertEqual(d.happiness, 2);
});

test("XP_TABLE: tier2_wrong gives 0 XP and -1 happiness", () => {
  const d = XP_TABLE.tier2_wrong;
  assertEqual(d.xp, 0);
  assertEqual(d.happiness, -1);
});

test("XP_TABLE: tier3_correct gives +5 XP and -2 hunger", () => {
  const d = XP_TABLE.tier3_correct;
  assertEqual(d.xp, 5);
  assertEqual(d.hunger, -2);
  assertEqual(d.happiness, 3);
});

test("XP_TABLE: tier3_wrong gives 0 XP and -2 energy", () => {
  const d = XP_TABLE.tier3_wrong;
  assertEqual(d.xp, 0);
  assertEqual(d.energy, -2);
});

test("XP_TABLE: tier4_correct gives +10 XP and +10 happiness", () => {
  const d = XP_TABLE.tier4_correct;
  assertEqual(d.xp, 10);
  assertEqual(d.happiness, 10);
  assertEqual(d.energy, 5);
});

test("XP_TABLE: tier4_wrong_fall gives 0 XP and -3 happiness", () => {
  const d = XP_TABLE.tier4_wrong_fall;
  assertEqual(d.xp, 0);
  assertEqual(d.happiness, -3);
});

test("XP_TABLE: review_correct gives +2 XP and +1 happiness", () => {
  const d = XP_TABLE.review_correct;
  assertEqual(d.xp, 2);
  assertEqual(d.happiness, 1);
});

test("XP_TABLE: review_wrong gives 0 XP and -2 happiness", () => {
  const d = XP_TABLE.review_wrong;
  assertEqual(d.xp, 0);
  assertEqual(d.happiness, -2);
});

// ---------------------------------------------------------------------------
// applyReward
// ---------------------------------------------------------------------------

test("applyReward: tier1_exposure bumps XP and happiness", () => {
  const s = makeStats({ knowledgeXp: 0, happiness: 50 });
  applyReward(s, "tier1_exposure");
  assertEqual(s.knowledgeXp, 1);
  assertEqual(s.happiness, 51);
});

test("applyReward: clamps happiness at 100", () => {
  const s = makeStats({ happiness: 99 });
  applyReward(s, "tier4_correct"); // +10 happiness → would be 109
  assertEqual(s.happiness, 100);
});

test("applyReward: clamps hunger at 0", () => {
  const s = makeStats({ hunger: 1 });
  applyReward(s, "tier3_correct"); // -2 hunger → would be -1
  assertEqual(s.hunger, 0);
});

test("applyReward: knowledgeXp never decreases", () => {
  const s = makeStats({ knowledgeXp: 20 });
  applyReward(s, "tier2_wrong"); // 0 XP
  assertEqual(s.knowledgeXp, 20);
  applyReward(s, "review_wrong"); // 0 XP
  assertEqual(s.knowledgeXp, 20);
});

test("applyReward: tier4_correct stacks XP correctly", () => {
  const s = makeStats({ knowledgeXp: 100 });
  applyReward(s, "tier4_correct");
  assertEqual(s.knowledgeXp, 110);
});

// ---------------------------------------------------------------------------
// computeStage — dual-threshold rules
// ---------------------------------------------------------------------------

test("computeStage: 0 XP → egg", () => {
  assertEqual(computeStage(0, 0), "egg");
});

test("computeStage: 29 XP → egg (baby threshold not hit)", () => {
  assertEqual(computeStage(29, 0), "egg");
});

test("computeStage: 30 XP, 0 grad → baby (baby has no grad-gate)", () => {
  assertEqual(computeStage(30, 0), "baby");
});

test("computeStage: 149 XP, 10 grad → baby", () => {
  assertEqual(computeStage(149, 10), "baby");
});

test("computeStage: 150 XP, 9 grad → baby (grad gate blocks child)", () => {
  assertEqual(computeStage(150, 9), "baby");
});

test("computeStage: 150 XP, 10 grad → child", () => {
  assertEqual(computeStage(150, 10), "child");
});

test("computeStage: 499 XP, 50 grad → child", () => {
  assertEqual(computeStage(499, 50), "child");
});

test("computeStage: 500 XP, 49 grad → child (grad gate)", () => {
  assertEqual(computeStage(500, 49), "child");
});

test("computeStage: 500 XP, 50 grad → teen", () => {
  assertEqual(computeStage(500, 50), "teen");
});

test("computeStage: 1999 XP, 200 grad → teen", () => {
  assertEqual(computeStage(1999, 200), "teen");
});

test("computeStage: 2000 XP, 199 grad → teen (grad gate)", () => {
  assertEqual(computeStage(2000, 199), "teen");
});

test("computeStage: 2000 XP, 200 grad → adult", () => {
  assertEqual(computeStage(2000, 200), "adult");
});

test("computeStage: 10000 XP, 1000 grad → adult", () => {
  assertEqual(computeStage(10000, 1000), "adult");
});

// ---------------------------------------------------------------------------
// unlockSkills
// ---------------------------------------------------------------------------

test("unlockSkills: egg → no skills unlocked even at huge grad count", () => {
  const pet = makePet({ stage: "egg" });
  const newSkills = unlockSkills(pet, 200);
  // alphabet_song has stageRequired: "baby", so egg-stage pet gets nothing.
  assertEqual(newSkills.length, 0);
});

test("unlockSkills: baby stage unlocks alphabet_song immediately", () => {
  const pet = makePet({ stage: "baby" });
  const newSkills = unlockSkills(pet, 0);
  const ids = newSkills.map((s) => s.id);
  assert(ids.includes("alphabet_song"), "alphabet_song should unlock");
});

test("unlockSkills: baby + 10 grad unlocks count_1_10", () => {
  const pet = makePet({ stage: "baby" });
  const newSkills = unlockSkills(pet, 10);
  const ids = newSkills.map((s) => s.id);
  assert(ids.includes("alphabet_song"), "alphabet_song should still unlock");
  assert(ids.includes("count_1_10"), "count_1_10 should unlock at 10 grad");
});

test("unlockSkills: child + 20 grad unlocks color_dance + animal_parade", () => {
  const pet = makePet({ stage: "child" });
  const newSkills = unlockSkills(pet, 20);
  const ids = newSkills.map((s) => s.id);
  assert(ids.includes("color_dance"), "color_dance unlocks");
  assert(ids.includes("animal_parade"), "animal_parade unlocks");
});

test("unlockSkills: skips already-owned skills", () => {
  const alphabet: PetSkill = {
    id: "alphabet_song",
    name: "字母大合唱",
    unlockAt: 0,
    kind: "song",
    unlockedAt: "2024-01-01",
  };
  const pet = makePet({ stage: "baby", skills: [alphabet] });
  const newSkills = unlockSkills(pet, 0);
  const ids = newSkills.map((s) => s.id);
  assert(
    !ids.includes("alphabet_song"),
    "alphabet_song should NOT be re-unlocked",
  );
});

test("unlockSkills: teen + 50 grad unlocks storytelling_basic", () => {
  const pet = makePet({ stage: "teen" });
  const newSkills = unlockSkills(pet, 50);
  const ids = newSkills.map((s) => s.id);
  assert(ids.includes("storytelling_basic"), "storytelling_basic unlocks");
});

test("unlockSkills: child stage blocks storytelling_basic even at 50 grad", () => {
  const pet = makePet({ stage: "child" });
  const newSkills = unlockSkills(pet, 80);
  const ids = newSkills.map((s) => s.id);
  assert(
    !ids.includes("storytelling_basic"),
    "storytelling_basic needs teen stage",
  );
});

test("unlockSkills: adult + 100 grad unlocks story_personalized", () => {
  const pet = makePet({ stage: "adult" });
  const newSkills = unlockSkills(pet, 100);
  const ids = newSkills.map((s) => s.id);
  assert(
    ids.includes("story_personalized"),
    "story_personalized unlocks at 100 grad",
  );
});

test("unlockSkills: sets unlockedAt timestamps on new skills", () => {
  const pet = makePet({ stage: "baby" });
  const newSkills = unlockSkills(pet, 0);
  assert(newSkills.length > 0, "should have new skills");
  for (const s of newSkills) {
    assert(
      typeof s.unlockedAt === "string" && s.unlockedAt.length > 0,
      `unlockedAt should be set on ${s.id}`,
    );
  }
});

// ---------------------------------------------------------------------------
// decayStats
// ---------------------------------------------------------------------------

test("decayStats: 0 days is no-op", () => {
  const s = makeStats({ hunger: 50, happiness: 60, energy: 70 });
  const out = decayStats(s, 0);
  assertEqual(out.hunger, 50);
  assertEqual(out.happiness, 60);
  assertEqual(out.energy, 70);
});

test("decayStats: 1 day drops stats per rule", () => {
  const s = makeStats({ hunger: 50, happiness: 60, energy: 70 });
  const out = decayStats(s, 1);
  assertEqual(out.hunger, 45);
  assertEqual(out.happiness, 57);
  assertEqual(out.energy, 68);
});

test("decayStats: clamps at 0", () => {
  const s = makeStats({ hunger: 2, happiness: 1, energy: 1 });
  const out = decayStats(s, 3);
  assertEqual(out.hunger, 0);
  assertEqual(out.happiness, 0);
  assertEqual(out.energy, 0);
});

test("decayStats: caps at maxDays", () => {
  const s = makeStats({ hunger: 100, happiness: 100, energy: 100 });
  // 100 days capped to 7: hunger -35, happiness -21, energy -14.
  const out = decayStats(s, 100);
  assertEqual(out.hunger, 65);
  assertEqual(out.happiness, 79);
  assertEqual(out.energy, 86);
});

test("decayStats: never touches knowledgeXp", () => {
  const s = makeStats({ knowledgeXp: 500 });
  const out = decayStats(s, 100);
  assertEqual(out.knowledgeXp, 500);
});

// ---------------------------------------------------------------------------
// renderTemplate
// ---------------------------------------------------------------------------

const makeVariant = (script: ShowTemplateVariant["script"]): ShowTemplateVariant => ({
  name: "test variant",
  script,
});

test("renderTemplate: substitutes {{word1}} in text", () => {
  const variant = makeVariant([
    { kind: "say", text: "Hello {{word1}}!" },
  ]);
  const show = renderTemplate(variant, ["apple"], {
    profileId: 1,
    skillId: "test",
  });
  assertEqual(show.script[0]!.text, "Hello apple!");
});

test("renderTemplate: substitutes multiple placeholders", () => {
  const variant = makeVariant([
    { kind: "say", text: "{{word1}} and {{word2}} and {{word3}}" },
  ]);
  const show = renderTemplate(variant, ["a", "b", "c"], {
    profileId: 1,
    skillId: "test",
  });
  assertEqual(show.script[0]!.text, "a and b and c");
});

test("renderTemplate: wraps around when fewer words than placeholders", () => {
  const variant = makeVariant([
    { kind: "say", text: "{{word1}} / {{word2}} / {{word3}}" },
  ]);
  const show = renderTemplate(variant, ["one"], {
    profileId: 1,
    skillId: "test",
  });
  // Only one recent word → all slots reuse "one".
  assertEqual(show.script[0]!.text, "one / one / one");
});

test("renderTemplate: substitutes word field on speak_word steps", () => {
  const variant = makeVariant([
    { kind: "speak_word", word: "{{word1}}", text: "Say {{word1}}" },
  ]);
  const show = renderTemplate(variant, ["apple", "banana"], {
    profileId: 1,
    skillId: "test",
  });
  assertEqual(show.script[0]!.word, "apple");
  assertEqual(show.script[0]!.text, "Say apple");
});

test("renderTemplate: leaves non-placeholder text alone", () => {
  const variant = makeVariant([
    { kind: "say", text: "Plain english, no braces" },
    { kind: "emote", emoji: "🎵", ms: 500 },
  ]);
  const show = renderTemplate(variant, ["foo"], {
    profileId: 1,
    skillId: "test",
  });
  assertEqual(show.script[0]!.text, "Plain english, no braces");
  assertEqual(show.script[1]!.emoji, "🎵");
  assertEqual(show.script[1]!.ms, 500);
});

test("renderTemplate: empty recent words uses fallback", () => {
  const variant = makeVariant([
    { kind: "say", text: "Hi {{word1}}!" },
  ]);
  const show = renderTemplate(variant, [], {
    profileId: 1,
    skillId: "test",
  });
  assertEqual(show.script[0]!.text, "Hi word!");
});

test("renderTemplate: show metadata is wired up", () => {
  const variant = makeVariant([{ kind: "say", text: "hi" }]);
  const show = renderTemplate(variant, [], {
    profileId: 42,
    skillId: "my_skill",
  });
  assertEqual(show.profileId, 42);
  assertEqual(show.skillId, "my_skill");
  assertEqual(show.source, "template");
  assert(
    typeof show.createdAt === "string" && show.createdAt.length > 0,
    "createdAt should be set",
  );
});

// ---------------------------------------------------------------------------
// Harness runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures: Array<{ name: string; err: unknown }> = [];

for (const { name, fn } of tests) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    failures.push({ name, err });
  }
}

// eslint-disable-next-line no-console
console.log(`\nRan ${tests.length} tests — ${passed} passed, ${failed} failed.`);
if (failures.length > 0) {
  for (const f of failures) {
    // eslint-disable-next-line no-console
    console.error(`  ✗ ${f.name}\n    ${String((f.err as Error).message ?? f.err)}`);
  }
  process.exit(1);
}
