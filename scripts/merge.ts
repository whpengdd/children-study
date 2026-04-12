// scripts/merge.ts
//
// Stage A5: merge the raw PEP / KET / PET / CEFR-J outputs into a canonical
// `Word[]` array matching `src/types/vocab.ts`. Key = normalized headWord + pos.
//
// This stage does NOT fill `scenarios` — it leaves that to Stage B (scenario
// generation). It does however produce a 10-slot placeholder array so that
// downstream code is always dealing with length-10 `scenarios` when merging
// in the AI output.

import * as path from "node:path";
import { writeJsonCache } from "./lib/cache.js";
import type { RawPepWord } from "./sources/pep.js";
import type { PdfEntry } from "./lib/pdf-parser.js";
import type { CefrjEntry } from "./sources/cefrj.js";

// Import the canonical types as `type` so we don't pull any runtime from src/.
// tsx resolves this .js specifier back to the .ts source at runtime.
import type { Word, Scenario, Exam, Cefr, PepGrade } from "../src/types/vocab.js";

const RAW_CATALOG_PATH = path.resolve(
  process.cwd(),
  ".cache/raw/catalog.json"
);

export interface MergeInput {
  pep: RawPepWord[];
  ket: PdfEntry[];
  pet: PdfEntry[];
  cefrj: CefrjEntry[];
}

export interface MergeStats {
  totalUnique: number;
  bySource: {
    pepOnly: number;
    ketOnly: number;
    petOnly: number;
    pepAndKet: number;
    pepAndPet: number;
    ketAndPet: number;
    all3: number;
  };
  cefrFilled: number;
}

interface Merged {
  headWord: string;
  pos?: string;
  phonetic: { us?: string; uk?: string };
  translation: string;
  altTranslations?: string[];
  exam: Exam[];
  pepGrade?: PepGrade;
  pepTerm?: 1 | 2;
  cefr?: Cefr;
  examples: { en: string; cn: string }[];
  // For diagnostics
  sources: Set<"pep" | "ket" | "pet" | "cefrj">;
}

function normHead(s: string): string {
  return s.trim().toLowerCase();
}

function normPos(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\./g, "");
}

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** POS first char: "n." -> "n", "adj." -> "a", "v." -> "v", unknown -> "x" */
function posFirstChar(pos: string | undefined): string {
  if (!pos) return "x";
  const cleaned = pos.trim().toLowerCase().replace(/[^a-z]/g, "");
  return cleaned[0] ?? "x";
}

function wordKey(headWord: string, pos: string | undefined): string {
  return `${normHead(headWord)}|${normPos(pos)}`;
}

function ensureMerged(
  map: Map<string, Merged>,
  headWord: string,
  pos: string | undefined
): Merged {
  const key = wordKey(headWord, pos);
  let m = map.get(key);
  if (!m) {
    m = {
      headWord: headWord.trim().toLowerCase(),
      pos: pos || undefined,
      phonetic: {},
      translation: "",
      altTranslations: undefined,
      exam: [],
      examples: [],
      sources: new Set(),
    };
    map.set(key, m);
  }
  return m;
}

/** Make a length-10 placeholder `Scenario[]` for a word that has no AI-generated
 *  content yet. Positions 0-2 are filled from dict examples if we have any;
 *  fallback is a minimal "sentence" using the headword so the app can still
 *  render something. */
function makePlaceholderScenarios(m: Merged): Scenario[] {
  const scenarios: Scenario[] = [];

  // --- Tier 1 (idx 0, 1, 2) ---
  const e0 = m.examples[0];
  scenarios.push({
    tier: 1,
    kind: "sentence",
    text: e0?.en || `This is a ${m.headWord}.`,
    cn: e0?.cn || `这是一个${m.translation || m.headWord}。`,
    source: e0 ? "dict" : "ai",
  });

  // Pos 1: ALWAYS image — matches the plan spec ("image 或 dialog") and
  // guarantees every word gets a visual slide at Tier 1. Words without a
  // curated emoji fall back to 🔤 via pickEmoji().
  scenarios.push({
    tier: 1,
    kind: "image",
    emoji: pickEmoji(m.headWord),
    caption: m.headWord,
    cn: m.translation || m.headWord,
  });

  // Pos 2: second dict example as a sentence, or chant fallback.
  const e1 = m.examples[1];
  if (e1) {
    scenarios.push({
      tier: 1,
      kind: "sentence",
      text: e1.en,
      cn: e1.cn,
      source: "dict",
    });
  } else {
    scenarios.push({
      tier: 1,
      kind: "chant",
      lines: [
        `${m.headWord}, ${m.headWord}!`,
        `I like ${m.headWord}.`,
        `${m.headWord}, yes I do!`,
      ],
      cn: m.translation || m.headWord,
    });
  }

  // --- Tier 2 (idx 3, 4) ---
  const fillerOptions = fillerOpts(m.headWord);
  scenarios.push({
    tier: 2,
    kind: "listen_choose",
    audioWord: m.headWord,
    options: [m.headWord, ...fillerOptions.slice(0, 3)],
    answer: m.headWord,
  });
  scenarios.push({
    tier: 2,
    kind: "en_to_cn_mcq",
    prompt: m.headWord,
    options: buildCnOptions(m.translation || m.headWord),
    answer: m.translation || m.headWord,
  });

  // --- Tier 3 (idx 5, 6, 7) ---
  scenarios.push({
    tier: 3,
    kind: "cn_to_en_mcq",
    promptCn: m.translation || m.headWord,
    options: [m.headWord, ...fillerOptions.slice(0, 3)],
    answer: m.headWord,
  });
  scenarios.push({
    tier: 3,
    kind: "fill_blank_choose",
    sentenceWithBlank: (e0?.en || `This is a ____.`).replace(
      new RegExp(m.headWord, "i"),
      "____"
    ),
    cn: e0?.cn || m.translation || m.headWord,
    options: [m.headWord, ...fillerOptions.slice(0, 3)],
    answer: m.headWord,
  });
  scenarios.push({
    tier: 3,
    kind: "fill_blank_choose",
    sentenceWithBlank: `The ____ is here.`,
    cn: `${m.translation || m.headWord}在这里。`,
    options: [m.headWord, ...fillerOptions.slice(0, 3)],
    answer: m.headWord,
  });

  // --- Tier 4 (idx 8, 9) ---
  scenarios.push({
    tier: 4,
    kind: "spell_from_audio",
    audioWord: m.headWord,
    answer: m.headWord,
  });
  scenarios.push({
    tier: 4,
    kind: "spell_from_cn",
    promptCn: m.translation || m.headWord,
    answer: m.headWord,
  });

  return scenarios;
}

// Very rough emoji map for the most common PEP3 content categories. Agent-Slides
// will replace this with real artwork, so we just ship a tiny hand-pick here.
const EMOJI_MAP: Record<string, string> = {
  // Fruit & food
  apple: "🍎",
  banana: "🍌",
  orange: "🍊",
  grape: "🍇",
  grapes: "🍇",
  pear: "🍐",
  watermelon: "🍉",
  strawberry: "🍓",
  peach: "🍑",
  lemon: "🍋",
  pineapple: "🍍",
  cherry: "🍒",
  mango: "🥭",
  rice: "🍚",
  bread: "🍞",
  egg: "🥚",
  milk: "🥛",
  water: "💧",
  juice: "🧃",
  cake: "🍰",
  pizza: "🍕",
  hamburger: "🍔",
  burger: "🍔",
  noodle: "🍜",
  noodles: "🍜",
  meat: "🍖",
  tomato: "🍅",
  potato: "🥔",
  carrot: "🥕",
  corn: "🌽",
  cheese: "🧀",
  sandwich: "🥪",
  salad: "🥗",
  soup: "🍲",
  candy: "🍬",
  chocolate: "🍫",
  cookie: "🍪",
  tea: "🍵",
  coffee: "☕",

  // Animals
  cat: "🐱",
  dog: "🐶",
  bird: "🐦",
  fish: "🐟",
  cow: "🐮",
  pig: "🐷",
  sheep: "🐑",
  horse: "🐴",
  rabbit: "🐰",
  mouse: "🐭",
  duck: "🦆",
  chicken: "🐔",
  elephant: "🐘",
  tiger: "🐯",
  lion: "🦁",
  bear: "🐻",
  monkey: "🐵",
  panda: "🐼",
  frog: "🐸",
  snake: "🐍",
  fox: "🦊",
  giraffe: "🦒",
  zebra: "🦓",
  wolf: "🐺",
  whale: "🐳",
  dolphin: "🐬",
  shark: "🦈",
  turtle: "🐢",
  bee: "🐝",
  butterfly: "🦋",
  ant: "🐜",

  // People & family
  boy: "👦",
  girl: "👧",
  man: "👨",
  woman: "👩",
  baby: "👶",
  father: "👨",
  mother: "👩",
  dad: "👨",
  mom: "👩",
  brother: "👦",
  sister: "👧",
  grandfather: "👴",
  grandmother: "👵",
  grandpa: "👴",
  grandma: "👵",
  teacher: "👨‍🏫",
  student: "🎓",
  doctor: "👨‍⚕️",
  nurse: "👩‍⚕️",
  farmer: "👨‍🌾",
  friend: "👫",

  // Body
  hand: "✋",
  foot: "🦶",
  eye: "👁",
  ear: "👂",
  nose: "👃",
  mouth: "👄",

  // Colors (orange is claimed by fruit above)
  red: "🟥",
  blue: "🟦",
  green: "🟩",
  yellow: "🟨",
  purple: "🟪",
  pink: "💗",
  black: "⬛",
  white: "⬜",
  brown: "🟫",

  // School
  book: "📖",
  pen: "🖊",
  pencil: "✏️",
  ruler: "📏",
  eraser: "🧽",
  crayon: "🖍",
  bag: "🎒",
  backpack: "🎒",
  chair: "🪑",
  school: "🏫",
  classroom: "🏫",
  notebook: "📓",
  paper: "📄",

  // Transport
  bus: "🚌",
  car: "🚗",
  bike: "🚲",
  bicycle: "🚲",
  train: "🚂",
  plane: "✈️",
  airplane: "✈️",
  ship: "🚢",
  boat: "⛵",
  taxi: "🚕",
  truck: "🚚",

  // Weather & sky
  sun: "☀️",
  moon: "🌙",
  star: "⭐",
  cloud: "☁️",
  rain: "🌧",
  snow: "❄️",
  wind: "💨",
  rainbow: "🌈",

  // Numbers 1-10
  one: "1️⃣",
  two: "2️⃣",
  three: "3️⃣",
  four: "4️⃣",
  five: "5️⃣",
  six: "6️⃣",
  seven: "7️⃣",
  eight: "8️⃣",
  nine: "9️⃣",
  ten: "🔟",

  // Nature
  tree: "🌳",
  flower: "🌸",
  grass: "🌿",
  leaf: "🍃",
  mountain: "⛰",
  river: "🏞",
  sea: "🌊",
  ocean: "🌊",
  beach: "🏖",

  // Home
  house: "🏠",
  home: "🏡",
  door: "🚪",
  window: "🪟",
  bed: "🛏",
  sofa: "🛋",
  clock: "🕰",
  key: "🔑",

  // Toys
  ball: "⚽",
  kite: "🪁",
  toy: "🧸",
  balloon: "🎈",
  gift: "🎁",

  // Actions
  run: "🏃",
  walk: "🚶",
  jump: "🤸",
  swim: "🏊",
  sing: "🎤",
  dance: "💃",
  write: "✍️",
  eat: "🍽",
  drink: "🥤",
  sleep: "😴",
  play: "🎮",
  smile: "😊",
  cry: "😢",

  // Music
  music: "🎵",
  song: "🎶",
  guitar: "🎸",
  piano: "🎹",
  drum: "🥁",

  // Clothing
  hat: "🎩",
  shirt: "👕",
  pants: "👖",
  shoe: "👟",
  shoes: "👟",
  sock: "🧦",

  // Misc
  fire: "🔥",
  ice: "🧊",
  heart: "❤️",
  phone: "📱",
  computer: "💻",
  camera: "📷",
  umbrella: "☂️",

  // More common PEP3-6 / KET / PET vocabulary
  arm: "💪",
  leg: "🦵",
  body: "🧍",
  face: "😀",
  child: "🧒",
  children: "🧒",
  kid: "🧒",
  family: "👨‍👩‍👧‍👦",
  box: "📦",
  cap: "🧢",
  coat: "🧥",
  dress: "👗",
  jacket: "🧥",
  scarf: "🧣",
  gloves: "🧤",
  jeans: "👖",
  happy: "😊",
  sad: "😢",
  angry: "😠",
  tired: "😴",
  china: "🇨🇳",
  america: "🇺🇸",
  usa: "🇺🇸",
  uk: "🇬🇧",
  canada: "🇨🇦",
  japan: "🇯🇵",
  england: "🇬🇧",
  see: "👀",
  look: "👀",
  hear: "👂",
  listen: "👂",
  speak: "🗣",
  talk: "🗣",
  say: "🗣",
  go: "➡️",
  come: "⬅️",
  want: "💭",
  help: "🆘",
  make: "🔨",
  open: "📂",
  close: "📁",
  money: "💵",
  dollar: "💵",
  coin: "🪙",
  time: "⌚",
  watch: "⌚",
  week: "📅",
  month: "📆",
  year: "📅",
  birthday: "🎂",
  party: "🎉",
  breakfast: "🍳",
  lunch: "🍱",
  dinner: "🍽",
  fork: "🍴",
  knife: "🔪",
  spoon: "🥄",
  plate: "🍽",
  cup: "🍵",
  bowl: "🥣",
  glass: "🥛",
  park: "🏞",
  zoo: "🦁",
  library: "📚",
  hospital: "🏥",
  shop: "🏪",
  store: "🏪",
  supermarket: "🛒",
  restaurant: "🍽",
  farm: "🚜",
  city: "🏙",
  village: "🏘",
  street: "🛣",
  road: "🛣",
  game: "🎮",
  movie: "🎬",
  tv: "📺",
  soccer: "⚽",
  football: "⚽",
  basketball: "🏀",
  baseball: "⚾",
  tennis: "🎾",
  trophy: "🏆",
  medal: "🏅",
  rocket: "🚀",
  helicopter: "🚁",
  subway: "🚇",
  owl: "🦉",
  penguin: "🐧",
  parrot: "🦜",
  eagle: "🦅",
  squirrel: "🐿",
  snail: "🐌",
  dinosaur: "🦖",
  dragon: "🐉",
  unicorn: "🦄",
  octopus: "🐙",
  crab: "🦀",
  pancake: "🥞",
  donut: "🍩",
  pie: "🥧",
  honey: "🍯",
  fries: "🍟",
  taco: "🌮",
  popcorn: "🍿",
  cupcake: "🧁",

  // Common adjectives and descriptors
  head: "🗣",
  mum: "👩",
  mummy: "👩",
  daddy: "👨",
  desk: "🪑",
  fruit: "🍎",
  big: "🐘",
  small: "🐜",
  tall: "📏",
  long: "📏",
  short: "📐",
  new: "✨",
  old: "🕰",
  map: "🗺",
  pupil: "🎓",
  beautiful: "🌹",
  funny: "😂",
  cute: "🥰",
  nice: "👍",
  good: "👍",
  bad: "👎",
  fast: "💨",
  slow: "🐢",
  hot: "🔥",
  cold: "🥶",
  cool: "❄️",
  clean: "✨",
  dirty: "🧽",
  easy: "✅",
  hard: "💎",
  early: "🌅",
  late: "🌆",
  strong: "💪",
  young: "🧒",
  like: "❤️",
  love: "❤️",
  think: "💭",
  know: "🧠",
  learn: "📚",
  study: "📚",
  teach: "👨‍🏫",
  remember: "🧠",
  work: "💼",
  job: "💼",
  letter: "✉️",
  english: "🇬🇧",
  chinese: "🇨🇳",
  "pencil box": "✏️",
  "ice cream": "🍦",
  "french fries": "🍟",
};
function pickEmoji(word: string): string {
  return EMOJI_MAP[word.toLowerCase()] ?? "🔤";
}

// A small pool of generic distractors. Good enough for placeholder MCQs;
// Claude will generate real confusables in Stage B.
const GENERIC_FILLERS = [
  "apple",
  "book",
  "cat",
  "dog",
  "pen",
  "red",
  "blue",
  "three",
  "run",
  "walk",
  "happy",
  "sad",
  "big",
  "small",
];
function fillerOpts(answer: string): string[] {
  return GENERIC_FILLERS.filter((f) => f !== answer);
}

const CN_FILLERS = ["苹果", "书", "猫", "狗", "笔", "红色", "蓝色", "三"];
function buildCnOptions(answer: string): string[] {
  const opts = CN_FILLERS.filter((f) => f !== answer).slice(0, 3);
  return [answer, ...opts];
}

/**
 * Merge all four raw sources into a `Word[]`, write `.cache/raw/catalog.json`
 * (the pre-scenario intermediate), and return both the merged `Word[]` and
 * some diagnostic stats.
 */
export async function mergeAll(
  input: MergeInput
): Promise<{ words: Word[]; stats: MergeStats }> {
  const map = new Map<string, Merged>();

  // --- PEP ---
  for (const raw of input.pep) {
    const m = ensureMerged(map, raw.headWord, raw.pos);
    m.sources.add("pep");
    if (!m.pos && raw.pos) m.pos = raw.pos;
    if (!m.phonetic.us && raw.phonetic.us) m.phonetic.us = raw.phonetic.us;
    if (!m.phonetic.uk && raw.phonetic.uk) m.phonetic.uk = raw.phonetic.uk;
    if (!m.translation && raw.translation) m.translation = raw.translation;
    if (raw.altTranslations) {
      m.altTranslations = Array.from(
        new Set([...(m.altTranslations ?? []), ...raw.altTranslations])
      );
    }
    if (raw.examples.length > 0 && m.examples.length < 3) {
      for (const ex of raw.examples) {
        if (m.examples.length >= 3) break;
        m.examples.push(ex);
      }
    }
    // PEP tags — take the LOWEST grade and earliest term for a given head+pos.
    if (
      m.pepGrade === undefined ||
      raw.grade < m.pepGrade ||
      (raw.grade === m.pepGrade &&
        (m.pepTerm === undefined || raw.term < m.pepTerm))
    ) {
      m.pepGrade = raw.grade;
      m.pepTerm = raw.term;
    }
  }

  // --- KET ---
  for (const raw of input.ket) {
    const m = ensureMerged(map, raw.headWord, raw.pos);
    m.sources.add("ket");
    if (!m.pos && raw.pos) m.pos = raw.pos;
    if (!m.exam.includes("KET")) m.exam.push("KET");
    if (!m.cefr) m.cefr = "A2";
  }

  // --- PET ---
  for (const raw of input.pet) {
    const m = ensureMerged(map, raw.headWord, raw.pos);
    m.sources.add("pet");
    if (!m.pos && raw.pos) m.pos = raw.pos;
    if (!m.exam.includes("PET")) m.exam.push("PET");
    // PET subsumes KET vocabulary; only bump level if nothing stronger exists.
    if (!m.cefr || m.cefr === "A1" || m.cefr === "A2") m.cefr = "B1";
  }

  // --- CEFR-J cross-reference ---
  let cefrFilled = 0;
  for (const raw of input.cefrj) {
    if (!raw.cefr) continue;
    const key = wordKey(raw.headWord, raw.pos);
    const m = map.get(key);
    if (!m) continue;
    m.sources.add("cefrj");
    if (!m.cefr) {
      m.cefr = raw.cefr;
      cefrFilled++;
    }
  }

  // --- Finalize: compute stats and build Word[] ---
  const words: Word[] = [];
  let pepOnly = 0,
    ketOnly = 0,
    petOnly = 0,
    pepAndKet = 0,
    pepAndPet = 0,
    ketAndPet = 0,
    all3 = 0;
  for (const m of map.values()) {
    const hasPep = m.sources.has("pep");
    const hasKet = m.sources.has("ket");
    const hasPet = m.sources.has("pet");
    if (hasPep && hasKet && hasPet) all3++;
    else if (hasPep && hasKet) pepAndKet++;
    else if (hasPep && hasPet) pepAndPet++;
    else if (hasKet && hasPet) ketAndPet++;
    else if (hasPep) pepOnly++;
    else if (hasKet) ketOnly++;
    else if (hasPet) petOnly++;

    const id = `w-${slugify(m.headWord)}-${posFirstChar(m.pos)}`;

    words.push({
      id,
      headWord: m.headWord,
      pos: m.pos,
      phonetic: m.phonetic,
      translation: m.translation,
      altTranslations: m.altTranslations,
      tags: {
        pepGrade: m.pepGrade,
        pepTerm: m.pepTerm,
        exam: m.exam,
        cefr: m.cefr,
      },
      scenarios: makePlaceholderScenarios(m),
    });
  }

  // Sort for deterministic output.
  words.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const stats: MergeStats = {
    totalUnique: words.length,
    bySource: {
      pepOnly,
      ketOnly,
      petOnly,
      pepAndKet,
      pepAndPet,
      ketAndPet,
      all3,
    },
    cefrFilled,
  };

  // Write the pre-scenario intermediate for debugging.
  await writeJsonCache(RAW_CATALOG_PATH, {
    generatedAt: new Date().toISOString(),
    stats,
    words,
  });
  console.log(
    `[merge] ${stats.totalUnique} unique words | ` +
      `pepOnly=${pepOnly} ketOnly=${ketOnly} petOnly=${petOnly} ` +
      `pepAndKet=${pepAndKet} pepAndPet=${pepAndPet} ketAndPet=${ketAndPet} all3=${all3} ` +
      `cefrFilled=${cefrFilled}`
  );
  return { words, stats };
}
