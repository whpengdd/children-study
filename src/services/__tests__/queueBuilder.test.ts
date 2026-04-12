// src/services/__tests__/queueBuilder.test.ts
//
// Pure-function tests for queueBuilder. Uses buildQueueFrom with a hand-built
// catalog and wordProgress map so no Dexie / no fetch is involved.

import test from "node:test";
import assert from "node:assert/strict";

import { buildQueueFrom, filterByPath, interleave } from "../queueBuilder";
import { makeFreshProgress } from "../progressService";
import type { LearningPath } from "../../types/path";
import type { SessionItem, WordProgress } from "../../types/progress";
import type { Settings } from "../../types/settings";
import type { Scenario, Word } from "../../types/vocab";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function tenScenarios(prefix: string): Scenario[] {
  return [
    { tier: 1, kind: "sentence", text: `${prefix}-sentence`, cn: "句", source: "dict" },
    { tier: 1, kind: "image", emoji: "🍎", caption: `${prefix}-image`, cn: "图" },
    { tier: 1, kind: "dialog", turns: [
      { speaker: "A", text: "hi", cn: "嗨" },
      { speaker: "B", text: "ok", cn: "好" },
    ] },
    { tier: 2, kind: "listen_choose", audioWord: prefix, options: [prefix,"x","y","z"], answer: prefix },
    { tier: 2, kind: "en_to_cn_mcq", prompt: prefix, options: ["a","b","c","d"], answer: "a" },
    { tier: 3, kind: "cn_to_en_mcq", promptCn: "测", options: [prefix,"b","c","d"], answer: prefix },
    { tier: 3, kind: "fill_blank_choose", sentenceWithBlank: "___", cn: "填", options: [prefix,"b","c","d"], answer: prefix },
    { tier: 3, kind: "word_formation", root: prefix, prompt: "?", answer: `${prefix}s` },
    { tier: 4, kind: "spell_from_audio", audioWord: prefix, answer: prefix },
    { tier: 4, kind: "spell_from_cn", promptCn: "拼", answer: prefix },
  ];
}

function mkWord(id: string, pepGrade: 3 | 4 | 5 | 6, exams: ("KET"|"PET")[] = ["KET"]): Word {
  return {
    id,
    headWord: id,
    pos: "n.",
    phonetic: { us: "/foo/" },
    translation: "foo",
    tags: { pepGrade, pepTerm: 1, exam: exams, cefr: "A2" },
    scenarios: tenScenarios(id),
  };
}

function mkSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    profileId: 1,
    ambientMode: false,
    carouselSpeed: "normal",
    voiceAccent: "us",
    maxNewWordsPerSession: 10,
    dueLookaheadMs: 86_400_000,
    showGenerationMode: "offline",
    dailyShowAiQuota: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// filterByPath
// ---------------------------------------------------------------------------

test("filterByPath: pep grade matches pepGrade tag", () => {
  const words = [mkWord("a", 3), mkWord("b", 4), mkWord("c", 3)];
  const out = filterByPath(words, { kind: "pep", grade: 3 });
  assert.deepEqual(out.map((w) => w.id), ["a", "c"]);
});

test("filterByPath: exam matches any word whose tags.exam includes it", () => {
  const words = [
    mkWord("a", 3, ["KET"]),
    mkWord("b", 4, ["PET"]),
    mkWord("c", 5, ["KET", "PET"]),
  ];
  const pet = filterByPath(words, { kind: "exam", exam: "PET" });
  assert.deepEqual(pet.map((w) => w.id).sort(), ["b", "c"]);
});

// ---------------------------------------------------------------------------
// interleave
// ---------------------------------------------------------------------------

test("interleave: review → drip → fresh block contiguous", () => {
  const mkItem = (id: string, kind: "review" | "new_drip" | "new_fresh", idx = 0): SessionItem => {
    const w = mkWord(id, 3);
    if (kind === "new_fresh") return { kind, word: w, scenario: w.scenarios[idx], scenarioIndex: idx, progress: null };
    const p = {} as WordProgress;
    return { kind, word: w, scenario: w.scenarios[idx], scenarioIndex: idx, progress: p };
  };

  const out = interleave({
    reviews: [mkItem("r1", "review"), mkItem("r2", "review")],
    drips: [mkItem("d1", "new_drip", 5)],
    freshBlocks: [
      [
        mkItem("f1", "new_fresh", 0),
        mkItem("f1", "new_fresh", 1),
        mkItem("f1", "new_fresh", 2),
      ],
      [
        mkItem("f2", "new_fresh", 0),
        mkItem("f2", "new_fresh", 1),
        mkItem("f2", "new_fresh", 2),
      ],
    ],
  });

  // Order check: r1, r2, d1, f1×3, f2×3 → 9 items total
  assert.equal(out.length, 9);
  assert.equal(out[0].word.id, "r1");
  assert.equal(out[1].word.id, "r2");
  assert.equal(out[2].word.id, "d1");
  // Fresh blocks contiguous by wordId
  assert.equal(out[3].word.id, "f1");
  assert.equal(out[4].word.id, "f1");
  assert.equal(out[5].word.id, "f1");
  assert.equal(out[6].word.id, "f2");
  assert.equal(out[7].word.id, "f2");
  assert.equal(out[8].word.id, "f2");
});

// ---------------------------------------------------------------------------
// buildQueueFrom: three buckets merged with correct ordering
// ---------------------------------------------------------------------------

test("buildQueueFrom: review precedes fresh, fresh blocks stay contiguous", () => {
  const wordFresh1 = mkWord("apple", 3);
  const wordFresh2 = mkWord("banana", 3);
  const wordDrip  = mkWord("cat", 3);
  const wordReview = mkWord("dog", 3);

  // Fresh words: no WordProgress row at all.
  // Drip: scenarioIndex 4, lastAdvancedAt yesterday so it becomes eligible.
  const catProgress: WordProgress = {
    ...makeFreshProgress(1, wordDrip, new Date("2026-04-10T09:00:00Z")),
    scenarioIndex: 4,
    tier: 2,
  };
  catProgress.lastAdvancedAt = "2026-04-10T09:00:00Z";

  // Review: tier 5, fsrsDue in the past.
  const dogProgress: WordProgress = {
    ...makeFreshProgress(1, wordReview, new Date("2026-04-01T09:00:00Z")),
    scenarioIndex: 10,
    tier: 5,
    fsrsDue: Date.parse("2026-04-10T09:00:00Z"),
  };

  const progressMap = new Map<string, WordProgress>([
    [wordDrip.id, catProgress],
    [wordReview.id, dogProgress],
  ]);

  const out = buildQueueFrom({
    words: [wordFresh1, wordFresh2, wordDrip, wordReview],
    progressByWordId: progressMap,
    path: { kind: "pep", grade: 3 },
    settings: mkSettings(),
    now: Date.parse("2026-04-11T09:00:00Z"),
  });

  // Reviews first
  assert.ok(out.length > 0);
  assert.equal(out[0].kind, "review");
  assert.equal(out[0].word.id, "dog");

  // Drip next
  assert.equal(out[1].kind, "new_drip");
  assert.equal(out[1].word.id, "cat");

  // Fresh blocks contiguous: every 3 in a row share a wordId, each being
  // new_fresh with scenarioIndex 0,1,2 in order.
  const freshItems = out.slice(2);
  assert.equal(freshItems.length, 6, "two fresh blocks of 3");
  for (let b = 0; b < 2; b++) {
    const block = freshItems.slice(b * 3, b * 3 + 3);
    const id = block[0].word.id;
    for (let i = 0; i < 3; i++) {
      assert.equal(block[i].kind, "new_fresh");
      assert.equal(block[i].word.id, id, "fresh block contiguous by wordId");
      assert.equal(block[i].scenarioIndex, i);
    }
  }
});

test("buildQueueFrom: fresh words respect maxNewWordsPerSession cap", () => {
  const words = [1,2,3,4,5].map((i) => mkWord(`w${i}`, 3));
  const out = buildQueueFrom({
    words,
    progressByWordId: new Map(),
    path: { kind: "pep", grade: 3 },
    settings: mkSettings({ maxNewWordsPerSession: 2 }),
    now: Date.parse("2026-04-11T09:00:00Z"),
  });
  // 2 fresh blocks × 3 cards each = 6
  assert.equal(out.length, 6);
  const uniqueWordIds = new Set(out.map((i) => i.word.id));
  assert.equal(uniqueWordIds.size, 2);
});

test("buildQueueFrom: in-progress word that advanced today is NOT re-dripped", () => {
  const w = mkWord("apple", 3);
  const now = Date.parse("2026-04-11T14:00:00Z");
  const p: WordProgress = {
    ...makeFreshProgress(1, w, new Date(now)),
    scenarioIndex: 4,
    tier: 2,
    // already advanced "today" (sod of now)
    lastAdvancedAt: new Date(now).toISOString(),
  };
  const out = buildQueueFrom({
    words: [w],
    progressByWordId: new Map([[w.id, p]]),
    path: { kind: "pep", grade: 3 },
    settings: mkSettings(),
    now,
  });
  assert.equal(out.length, 0);
});

test("buildQueueFrom is deterministic across calls with same (progress, day)", () => {
  const words = [1,2,3,4,5].map((i) => mkWord(`w${i}`, 3));
  const args = {
    words,
    progressByWordId: new Map<string, WordProgress>(),
    path: { kind: "pep", grade: 3 } as LearningPath,
    settings: mkSettings({ maxNewWordsPerSession: 5 }),
    now: Date.parse("2026-04-11T09:00:00Z"),
  };
  const a = buildQueueFrom(args);
  const b = buildQueueFrom(args);
  assert.deepEqual(a.map((x) => x.word.id), b.map((x) => x.word.id));
});
