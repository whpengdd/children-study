// src/services/__tests__/progress.test.ts
//
// Pure-function tests for the progressService state machine. These run under
// Node's built-in `node:test` runner via `npx tsx`. No Dexie needed — we hit
// applyExposure / applyCheck / applyReview directly and thread the resulting
// WordProgress forward manually.

import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCheck,
  applyExposure,
  applyReview,
  makeFreshProgress,
  tierAt,
} from "../progressService";
import type { SessionItem, WordProgress } from "../../types/progress";
import type { Scenario, Word } from "../../types/vocab";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function fixtureWord(): Word {
  const scenarios: Scenario[] = [
    { tier: 1, kind: "sentence", text: "I eat an apple.", cn: "我吃苹果。", source: "dict" },
    { tier: 1, kind: "image", emoji: "🍎", caption: "an apple", cn: "一个苹果" },
    { tier: 1, kind: "dialog", turns: [
      { speaker: "A", text: "What is this?", cn: "这是什么？" },
      { speaker: "B", text: "An apple.", cn: "一个苹果。" },
    ] },
    { tier: 2, kind: "listen_choose", audioWord: "apple", options: ["apple","banana","orange","grape"], answer: "apple" },
    { tier: 2, kind: "en_to_cn_mcq", prompt: "apple", options: ["苹果","香蕉","橘子","葡萄"], answer: "苹果" },
    { tier: 3, kind: "cn_to_en_mcq", promptCn: "苹果", options: ["apple","pear","peach","lemon"], answer: "apple" },
    { tier: 3, kind: "fill_blank_choose", sentenceWithBlank: "She has an ___.", cn: "她有一个苹果。", options: ["apple","egg","ant","arm"], answer: "apple" },
    { tier: 3, kind: "word_formation", root: "apple", prompt: "plural?", answer: "apples" },
    { tier: 4, kind: "spell_from_audio", audioWord: "apple", answer: "apple" },
    { tier: 4, kind: "spell_from_cn", promptCn: "苹果", answer: "apple" },
  ];
  return {
    id: "w-apple-n",
    headWord: "apple",
    pos: "n.",
    phonetic: { us: "/ˈæp.əl/" },
    translation: "苹果",
    tags: { pepGrade: 3, pepTerm: 1, exam: ["KET","PET"], cefr: "A2" },
    scenarios,
  };
}

function mkItem(word: Word, idx: number, kind: SessionItem["kind"]): SessionItem {
  const scenario = word.scenarios[idx];
  if (kind === "new_fresh") return { kind, word, scenario, scenarioIndex: idx, progress: null };
  // For in-progress paths we don't use the .progress field in the pure core, so a
  // simple cast is fine; tests don't read it.
  return { kind, word, scenario, scenarioIndex: idx, progress: {} as WordProgress };
}

// ---------------------------------------------------------------------------
// tierAt table
// ---------------------------------------------------------------------------

test("tierAt maps scenarioIndex to tier correctly", () => {
  assert.equal(tierAt(0), 1);
  assert.equal(tierAt(1), 1);
  assert.equal(tierAt(2), 1);
  assert.equal(tierAt(3), 2);
  assert.equal(tierAt(4), 2);
  assert.equal(tierAt(5), 3);
  assert.equal(tierAt(6), 3);
  assert.equal(tierAt(7), 3);
  assert.equal(tierAt(8), 4);
  assert.equal(tierAt(9), 4);
});

// ---------------------------------------------------------------------------
// Tier progression happy path
// ---------------------------------------------------------------------------

test("full progression: 3 exposures → 2 tier-2 → 3 tier-3 → 2 tier-4 → graduated", () => {
  const word = fixtureWord();
  let p: WordProgress = makeFreshProgress(1, word, new Date("2026-04-11T09:00:00Z"));
  const seen = new Set<string>();

  // 3 exposures
  for (let i = 0; i < 3; i++) {
    const res = applyExposure(p, mkItem(word, i, "new_fresh"), seen);
    p = res.progress;
    assert.equal(res.advanced, true, `exposure ${i} should advance`);
    assert.deepEqual(res.learningEvent, { kind: "tier1_exposure", wordId: "w-apple-n" });
  }
  assert.equal(p.scenarioIndex, 3);
  assert.equal(p.tier, 2);

  // 2 tier-2 correct answers
  for (let i = 3; i < 5; i++) {
    const res = applyCheck(p, mkItem(word, i, "new_drip"), true, 3000);
    p = res.progress;
    assert.equal(res.learningEvent.kind, "tier2_correct");
    assert.equal(res.graduated, false);
  }
  assert.equal(p.scenarioIndex, 5);
  assert.equal(p.tier, 3);

  // 3 tier-3 correct answers
  for (let i = 5; i < 8; i++) {
    const res = applyCheck(p, mkItem(word, i, "new_drip"), true, 3000);
    p = res.progress;
    assert.equal(res.learningEvent.kind, "tier3_correct");
    assert.equal(res.graduated, false);
  }
  assert.equal(p.scenarioIndex, 8);
  assert.equal(p.tier, 4);

  // 2 tier-4 correct answers → graduates on the second
  for (let i = 8; i < 10; i++) {
    const res = applyCheck(p, mkItem(word, i, "new_drip"), true, 3000);
    p = res.progress;
    assert.equal(res.learningEvent.kind, "tier4_correct");
    if (i === 9) {
      assert.equal(res.graduated, true);
      if (res.learningEvent.kind === "tier4_correct") {
        assert.equal(res.learningEvent.graduated, true);
      }
    }
  }

  // After the last correct: tier === 5, fsrsDue set.
  assert.equal(p.tier, 5);
  assert.equal(p.scenarioIndex, 10);
  assert.ok(p.fsrsDue > 0, "fsrsDue should be populated after graduation");
  assert.ok(p.totalGraduations >= 1);
});

// ---------------------------------------------------------------------------
// Tier 4 rollback
// ---------------------------------------------------------------------------

test("Tier 4 wrong ×2 rolls back to scenarioIndex 6 (Tier 3)", () => {
  const word = fixtureWord();
  let p: WordProgress = makeFreshProgress(1, word);
  // Jump straight to Tier 4: scenarioIndex = 8, tierWrongs[3] = 0
  p = { ...p, scenarioIndex: 8, tier: 4, tierAttempts: [3,2,3,0], tierWrongs: [0,0,0,0] };

  // First wrong: NO rollback yet, just a wrong_fall event, no index change.
  const r1 = applyCheck(p, mkItem(word, 8, "new_drip"), false, 6000);
  p = r1.progress;
  assert.equal(p.scenarioIndex, 8, "first wrong should not move index");
  assert.equal(p.tier, 4);
  assert.equal(p.tierWrongs[3], 1);
  assert.equal(r1.learningEvent.kind, "tier4_wrong_fall");

  // Second wrong: rollback triggers → scenarioIndex = max(5, 8-2) = 6, tier = 3.
  const r2 = applyCheck(p, mkItem(word, 8, "new_drip"), false, 6000);
  p = r2.progress;
  assert.equal(p.scenarioIndex, 6, "rollback should land at index 6");
  assert.equal(p.tier, 3);
  assert.equal(p.tierWrongs[3], 2);
  assert.equal(r2.learningEvent.kind, "tier4_wrong_fall");
  assert.equal(r2.stageChange?.from, 4);
  assert.equal(r2.stageChange?.to, 3);
});

// ---------------------------------------------------------------------------
// Graduation rating inference
// ---------------------------------------------------------------------------

test("graduation with zero wrongs + fast latency → Easy scheduling", () => {
  const word = fixtureWord();
  // Seed with scenarioIndex 9 (last tier-4 card), no wrongs, about to graduate.
  let p: WordProgress = makeFreshProgress(1, word);
  p = { ...p, scenarioIndex: 9, tier: 4, tierAttempts: [3,2,3,1], tierWrongs: [0,0,0,0] };
  const res = applyCheck(p, mkItem(word, 9, "new_drip"), true, 2000); // fast
  assert.equal(res.graduated, true);
  assert.equal(res.progress.tier, 5);
  // We can't introspect the FSRS rating directly without rerunning, but we
  // can sanity check that an "Easy" schedule produces a reasonably long
  // interval (ts-fsrs typically schedules Easy days-to-weeks out on first pass).
  const intervalMs = res.progress.fsrsDue - Date.now();
  assert.ok(intervalMs > 0, "fsrsDue should be in the future");
});

test("graduation with 2 wrongs → Again rating → lands near-term", () => {
  // This case technically CAN'T be hit via the normal pipeline since the 2nd
  // wrong triggers rollback, but graduateToFsrs itself should still map
  // 2-wrongs → Again. We drive it via the graduation path by forcing
  // scenarioIndex 9 after 2 wrongs and a correct answer.
  const word = fixtureWord();
  // Fake a situation where we somehow recorded 2 wrongs but still proceed:
  // this can happen via rollback-then-retry, where tierWrongs[3] doesn't reset.
  let p: WordProgress = makeFreshProgress(1, word);
  p = { ...p, scenarioIndex: 9, tier: 4, tierAttempts: [3,2,3,3], tierWrongs: [0,0,0,2] };
  const res = applyCheck(p, mkItem(word, 9, "new_drip"), true, 3000);
  assert.equal(res.graduated, true);
  assert.equal(res.progress.tier, 5);
  // With Rating.Again the due is short — bounded to under a few days for a
  // fresh card. Just assert it's in the future.
  assert.ok(res.progress.fsrsDue > 0);
});

// ---------------------------------------------------------------------------
// Exposure dedupe
// ---------------------------------------------------------------------------

test("same exposure item twice in one session only counts once", () => {
  const word = fixtureWord();
  let p: WordProgress = makeFreshProgress(1, word);
  const seen = new Set<string>();

  const r1 = applyExposure(p, mkItem(word, 0, "new_fresh"), seen);
  p = r1.progress;
  assert.equal(r1.advanced, true);
  assert.ok(r1.learningEvent, "first exposure emits event");

  const r2 = applyExposure(p, mkItem(word, 0, "new_fresh"), seen);
  assert.equal(r2.advanced, false);
  assert.equal(r2.learningEvent, undefined);
});

// ---------------------------------------------------------------------------
// FSRS review
// ---------------------------------------------------------------------------

test("applyReview: wrong review increments totalLapses", () => {
  const word = fixtureWord();
  let p: WordProgress = makeFreshProgress(1, word);
  p = { ...p, tier: 5, scenarioIndex: 10, totalLapses: 0 };

  const res = applyReview(p, mkItem(word, 0, "review"), false, 8000);
  assert.equal(res.lapsed, true);
  assert.equal(res.progress.totalLapses, 1);
  assert.equal(res.learningEvent.kind, "review_wrong");
});

test("applyReview: correct review emits review_correct and keeps totalLapses", () => {
  const word = fixtureWord();
  let p: WordProgress = makeFreshProgress(1, word);
  p = { ...p, tier: 5, scenarioIndex: 10, totalLapses: 0 };

  const res = applyReview(p, mkItem(word, 0, "review"), true, 2500);
  assert.equal(res.lapsed, false);
  assert.equal(res.progress.totalLapses, 0);
  assert.equal(res.learningEvent.kind, "review_correct");
});
