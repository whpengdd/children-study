// src/types/vocab.ts
//
// Core word + scenario type contracts. These are THE source of truth for every
// other wave: Pipeline generates them, Slides render them, LearnCore advances
// state over them, Pet rewards off their successful completion.

export type PepGrade = 3 | 4 | 5 | 6;
export type Exam = "KET" | "PET";
export type Cefr = "A1" | "A2" | "B1" | "B2";

export interface WordTags {
  /** Which PEP grade this word appears in, if any. */
  pepGrade?: PepGrade;
  /** Which PEP term (上册/下册) this word belongs to, if any. */
  pepTerm?: 1 | 2;
  /** Which Cambridge exams list this word — empty array if purely a PEP word. */
  exam: Exam[];
  /** CEFR level, cross-referenced from CEFR-J when available. */
  cefr?: Cefr;
}

export interface Word {
  /** Slug, e.g. "w-apple-n". */
  id: string;
  /** The written form of the word, e.g. "apple". */
  headWord: string;
  /** Part of speech, e.g. "n.", "v.". */
  pos?: string;
  phonetic: { us?: string; uk?: string };
  /** Primary Chinese translation. */
  translation: string;
  /** Additional Chinese translations (alternative senses). */
  altTranslations?: string[];
  tags: WordTags;
  /** Always length 10; index is the tier position (see Scenario docstring). */
  scenarios: Scenario[];
}

/**
 * Tier = cognitive-load layer of active recall.
 *   1 = exposure (passive carousel)
 *   2 = recognition (weak active — pick from choices after hearing/reading)
 *   3 = production (medium active — recall + select)
 *   4 = mastery (strong active — spell from audio / from Chinese)
 */
export type ScenarioTier = 1 | 2 | 3 | 4;

/**
 * A word's `scenarios` array is always length 10. Positions map to tiers:
 *
 * | index | tier | kind candidates                                |
 * |-------|------|------------------------------------------------|
 * | 0     | 1    | sentence                                       |
 * | 1     | 1    | image | dialog                                 |
 * | 2     | 1    | chant | sentence                                |
 * | 3     | 2    | listen_choose                                  |
 * | 4     | 2    | en_to_cn_mcq                                   |
 * | 5     | 3    | cn_to_en_mcq                                   |
 * | 6     | 3    | fill_blank_choose                              |
 * | 7     | 3    | word_formation (KET/PET) | fill_blank_choose   |
 * | 8     | 4    | spell_from_audio                               |
 * | 9     | 4    | spell_from_cn                                  |
 */
export type Scenario =
  // --- Tier 1: exposure (index 0–2, first-time dense block) ---
  | {
      tier: 1;
      kind: "sentence";
      text: string;
      cn: string;
      source: "dict" | "ai";
    }
  | {
      tier: 1;
      kind: "dialog";
      turns: { speaker: "A" | "B"; text: string; cn: string }[];
    }
  | {
      tier: 1;
      kind: "image";
      emoji: string;
      caption: string;
      cn: string;
    }
  | {
      tier: 1;
      kind: "chant";
      lines: string[];
      cn: string;
    }

  // --- Tier 2: recognition (index 3–4) ---
  | {
      tier: 2;
      kind: "listen_choose";
      audioWord: string;
      options: string[];
      answer: string;
    }
  | {
      tier: 2;
      kind: "en_to_cn_mcq";
      prompt: string;
      options: string[];
      answer: string;
    }

  // --- Tier 3: production (index 5–7) ---
  | {
      tier: 3;
      kind: "cn_to_en_mcq";
      promptCn: string;
      options: string[];
      answer: string;
    }
  | {
      tier: 3;
      kind: "fill_blank_choose";
      sentenceWithBlank: string;
      cn: string;
      options: string[];
      answer: string;
    }
  | {
      tier: 3;
      kind: "word_formation";
      root: string;
      prompt: string;
      answer: string;
    }

  // --- Tier 4: mastery (index 8–9, graduation gate) ---
  | {
      tier: 4;
      kind: "spell_from_audio";
      audioWord: string;
      answer: string;
    }
  | {
      tier: 4;
      kind: "spell_from_cn";
      promptCn: string;
      answer: string;
    };

/**
 * The structure of `public/data/catalog.json` (or chunked indices). Loaded
 * lazily by vocabLoader.
 */
export interface Catalog {
  generatedAt: string;
  /** The full deduped word list, ~3000+ entries after the real pipeline runs. */
  words: Word[];
  /** Index from PEP grade → wordIds. */
  byPepGrade: Record<PepGrade, string[]>;
  /** Index from exam name → wordIds. */
  byExam: Record<Exam, string[]>;
}
