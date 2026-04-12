// scripts/lib/scenario-prompt.ts
//
// v2: per-grade HARD age limits (max words/sentence, no-complex-tense rules,
// vocabulary ceilings) + optional Tier 1 rewrite when a dict example exceeds
// the limit. Output shape changed from bare array to { scenarios, tier1Override }.

import type { Word } from "../../src/types/vocab.js";

export const PROMPT_VERSION = "v2";

interface LevelConstraint {
  label: string;
  maxWords: number;
  body: string;
}

/**
 * Per-grade hard constraint. Sent verbatim to Claude so it MUST respect it.
 * Aggressive limits because dict examples from kajweb are too complex for
 * Chinese primary school readers.
 */
function levelConstraint(word: Word): LevelConstraint {
  const t = word.tags;

  if (t.pepGrade === 3) {
    return {
      label: "PEP grade 3",
      maxWords: 6,
      body: `
AGE: 8-9 years old (Chinese primary school grade 3).
HARD LIMITS (non-negotiable):
- Every English sentence MUST be <= 6 words total.
- ONLY present simple tense. NO past / future / perfect / continuous.
- NO conjunctions: and, but, because, if, when, while, though, although.
- NO subordinate clauses. NO relative pronouns used as relatives (who/which/that).
- NO idioms, NO phrasal verbs.
- Vocabulary: use ONLY the ~300 most common English words PLUS the target headword.
GOOD: "I like red apples." / "She has a cat." / "The dog is big."
BAD:  "Although she was tired, she still ran to catch the bus."
BAD:  "The apple is on the wooden table next to my mother's bag."
`.trim(),
    };
  }

  if (t.pepGrade === 4) {
    return {
      label: "PEP grade 4",
      maxWords: 8,
      body: `
AGE: 9-10 years old (Chinese primary school grade 4).
HARD LIMITS:
- Every sentence MUST be <= 8 words.
- Present simple / simple past only. NO perfect or continuous.
- NO subordinate clauses. At most ONE basic conjunction per sentence.
- Vocabulary: ~500 most common English words + the target headword.
GOOD: "He played football yesterday." / "I can see a blue bird."
BAD:  "After eating breakfast he went to school with his friends."
`.trim(),
    };
  }

  if (t.pepGrade && t.pepGrade <= 6) {
    return {
      label: `PEP grade ${t.pepGrade}`,
      maxWords: 10,
      body: `
AGE: 10-12 years old (Chinese primary school grade 5-6).
HARD LIMITS:
- Every sentence MUST be <= 10 words.
- Present / past / future simple only. NO perfect tenses.
- At most ONE subordinate clause per sentence.
- Avoid idioms and phrasal verbs.
`.trim(),
    };
  }

  if (t.exam.includes("KET") || t.cefr === "A2") {
    return {
      label: "CEFR A2 / Cambridge KET",
      maxWords: 12,
      body: `
TARGET: CEFR A2 / Cambridge KET.
HARD LIMITS:
- Every sentence MUST be <= 12 words.
- Use A2-level vocabulary only. No B1+ words except the target headword itself.
- Familiar daily-life topics. No abstract or academic themes.
`.trim(),
    };
  }

  return {
    label: "CEFR B1 / Cambridge PET",
    maxWords: 14,
    body: `
TARGET: CEFR B1 / Cambridge PET.
HARD LIMITS:
- Every sentence MUST be <= 14 words.
- Familiar topics. Short clear sentences preferred over long clauses.
`.trim(),
  };
}

export function buildPrompt(word: Word): { system: string; user: string } {
  const level = levelConstraint(word);

  const system = [
    "You are a children's English vocabulary author writing content for ages 8-12.",
    "You output JSON ONLY — no prose, no markdown fences, no commentary.",
    "Before finalising your output you MUST count the words in every English sentence you produce.",
    `If any sentence exceeds the HARD LIMIT (${level.maxWords} words for this word), rewrite it until it fits.`,
    "For every MCQ provide exactly 4 options including the correct answer.",
    "Wrong options MUST come from the SAME semantic category as the answer (colors with colors, animals with animals, actions with actions).",
    "Wrong options MUST NOT be trivially unrelated words like 'apple/book/cat' unless the answer itself is one of those.",
    "Never repeat the correct answer in the options list.",
  ].join(" ");

  const tier1Existing = word.scenarios
    .slice(0, 3)
    .map((s, i) => `  idx ${i}: ${JSON.stringify(s)}`)
    .join("\n");

  const tier1CheckInstruction = `
CHECK TIER 1 (idx 0 and idx 2 — these came from a dictionary and may be too complex):
- Count the words in TIER1_EXISTING idx 0 (if kind=sentence) and idx 2 (if kind=sentence).
- If EITHER exceeds the HARD LIMIT (${level.maxWords} words), you MUST include a "tier1Override" field in your output with simplified replacements.
- Each replacement sentence MUST still use the target headword "${word.headWord}" naturally.
- Each replacement sentence MUST also respect the HARD LIMITS above.
- If a Tier 1 slot is not a sentence (e.g. image or chant), DO NOT include an override for it.
- If both Tier 1 sentences already fit, omit "tier1Override" entirely (or set it to null).
`.trim();

  const schema = `
REQUIRED OUTPUT — a single JSON object with this exact shape (NOT a bare array):

{
  "scenarios": [
    // idx 3 (tier 2)
    { "tier": 2, "kind": "listen_choose",     "audioWord": "${word.headWord}", "options": [string, string, string, string], "answer": "${word.headWord}" },
    // idx 4 (tier 2)
    { "tier": 2, "kind": "en_to_cn_mcq",      "prompt": "${word.headWord}",    "options": [cn, cn, cn, cn],                 "answer": "<correct Chinese>" },
    // idx 5 (tier 3)
    { "tier": 3, "kind": "cn_to_en_mcq",      "promptCn": "<Chinese gloss>",   "options": [en, en, en, en],                 "answer": "${word.headWord}" },
    // idx 6 (tier 3)
    { "tier": 3, "kind": "fill_blank_choose", "sentenceWithBlank": "...____...", "cn": "...", "options": [en,en,en,en],    "answer": "${word.headWord}" },
    // idx 7 (tier 3)
    { "tier": 3, "kind": "fill_blank_choose", "sentenceWithBlank": "...____...", "cn": "...", "options": [en,en,en,en],    "answer": "${word.headWord}" },
    //   OR for KET/PET words only:
    // { "tier": 3, "kind": "word_formation",  "root": "${word.headWord}", "prompt": "...", "answer": "<derived form>" },
    // idx 8 (tier 4)
    { "tier": 4, "kind": "spell_from_audio",  "audioWord": "${word.headWord}", "answer": "${word.headWord}" },
    // idx 9 (tier 4)
    { "tier": 4, "kind": "spell_from_cn",     "promptCn": "<Chinese gloss>",   "answer": "${word.headWord}" }
  ],

  // OPTIONAL — include only when a dict Tier 1 sentence exceeds the word-count limit.
  "tier1Override": {
    "idx0": { "text": "<short simplified sentence using ${word.headWord}>", "cn": "<Chinese translation>" },
    "idx2": { "text": "<another simplified sentence>", "cn": "<Chinese translation>" }
  }
}

The "scenarios" array MUST contain exactly 7 items in the order shown above.
`.trim();

  const user = [
    `WORD: ${word.headWord}${word.pos ? " (" + word.pos + ")" : ""}`,
    `TRANSLATION: ${word.translation}`,
    `TAGS: ${JSON.stringify(word.tags)}`,
    "",
    "TIER1_EXISTING (positions already filled from dictionary examples — for context and complexity check):",
    tier1Existing,
    "",
    `TARGET LEVEL: ${level.label}`,
    level.body,
    "",
    tier1CheckInstruction,
    "",
    schema,
    "",
    "Output the JSON object and nothing else. No commentary. No markdown fences.",
  ].join("\n");

  return { system, user };
}
