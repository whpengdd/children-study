// scripts/sources/pep.ts
//
// Stage A1: download the 8 PEPXiaoXue ZIPs from kajweb/dict and parse them
// into a flat RawPepWord[] list.
//
// The kajweb/dict repo stores its book archives under /book (no /zips/ dir).
// Each PEP XiaoXue ZIP contains a single NDJSON file whose line items look
// roughly like:
//
//   {
//     "wordRank": 1,
//     "headWord": "ruler",
//     "content": {
//       "word": {
//         "wordHead": "ruler",
//         "wordId": "PEPXiaoXue3_1_1",
//         "content": {
//           "sentence": { "sentences": [{"sContent": "...", "sCn": "..."}] },
//           "usphone": "'rulɚ",
//           "ukphone": "'ruːlə",
//           "trans": [{ "tranCn": "尺子", "tranOther": "..." }],
//           "syno":  { "synos": [{ "pos": "n", "tran": "..." }] }
//         }
//       }
//     },
//     "bookId": "PEPXiaoXue3_1"
//   }
//
// We extract headword + phonetic + translation + 1..3 example sentences.

import AdmZip from "adm-zip";
import * as path from "node:path";
import { downloadCached, readFileBuffer } from "../lib/cache.js";

const CACHE_DIR = path.resolve(process.cwd(), ".cache/zips");

/** Hard-coded from the kajweb/dict GitHub /book directory listing. */
const PEP_FILES: { name: string; url: string; grade: 3 | 4 | 5 | 6; term: 1 | 2 }[] =
  [
    {
      name: "PEPXiaoXue3_1",
      grade: 3,
      term: 1,
      url: "https://raw.githubusercontent.com/kajweb/dict/master/book/1521164661774_PEPXiaoXue3_1.zip",
    },
    {
      name: "PEPXiaoXue3_2",
      grade: 3,
      term: 2,
      url: "https://raw.githubusercontent.com/kajweb/dict/master/book/1521164656604_PEPXiaoXue3_2.zip",
    },
    {
      name: "PEPXiaoXue4_1",
      grade: 4,
      term: 1,
      url: "https://raw.githubusercontent.com/kajweb/dict/master/book/1521164677447_PEPXiaoXue4_1.zip",
    },
    {
      name: "PEPXiaoXue4_2",
      grade: 4,
      term: 2,
      url: "https://raw.githubusercontent.com/kajweb/dict/master/book/1521164663086_PEPXiaoXue4_2.zip",
    },
    {
      name: "PEPXiaoXue5_1",
      grade: 5,
      term: 1,
      url: "https://raw.githubusercontent.com/kajweb/dict/master/book/1530101080610_PEPXiaoXue5_1.zip",
    },
    {
      name: "PEPXiaoXue5_2",
      grade: 5,
      term: 2,
      url: "https://raw.githubusercontent.com/kajweb/dict/master/book/1530101073491_PEPXiaoXue5_2.zip",
    },
    {
      name: "PEPXiaoXue6_1",
      grade: 6,
      term: 1,
      url: "https://raw.githubusercontent.com/kajweb/dict/master/book/1530101075331_PEPXiaoXue6_1.zip",
    },
    {
      name: "PEPXiaoXue6_2",
      grade: 6,
      term: 2,
      url: "https://raw.githubusercontent.com/kajweb/dict/master/book/1521164632445_PEPXiaoXue6_2.zip",
    },
  ];

export interface PepExample {
  en: string;
  cn: string;
}

export interface RawPepWord {
  headWord: string;
  /** e.g. "n.", "v.", "adj." — derived from syno[0].pos if available. */
  pos?: string;
  phonetic: { us?: string; uk?: string };
  translation: string;
  altTranslations?: string[];
  examples: PepExample[];
  grade: 3 | 4 | 5 | 6;
  term: 1 | 2;
}

/**
 * Each kajweb/dict ZIP contains a single .json file (NDJSON), one word per line.
 * Parse defensively — some fields are optional / omitted.
 */
function parsePepNdjson(
  ndjson: string,
  grade: 3 | 4 | 5 | 6,
  term: 1 | 2
): RawPepWord[] {
  const out: RawPepWord[] = [];
  const lines = ndjson.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let row: any;
    try {
      row = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const headWord: string = row?.headWord ?? row?.content?.word?.wordHead;
    if (typeof headWord !== "string" || !headWord) continue;

    const wordContent = row?.content?.word?.content ?? {};
    const usphone: string | undefined = wordContent.usphone;
    const ukphone: string | undefined = wordContent.ukphone;

    // Examples: content.word.content.sentence.sentences[] ({sContent, sCn})
    const sents: any[] = wordContent?.sentence?.sentences ?? [];
    const examples: PepExample[] = sents
      .map((s) => ({
        en: (s?.sContent ?? "").toString().trim(),
        cn: (s?.sCn ?? "").toString().trim(),
      }))
      .filter((e) => e.en.length > 0)
      .slice(0, 3);

    // Primary translation: trans[0].tranCn
    const trans: any[] = wordContent?.trans ?? [];
    const primaryTranslation: string =
      (trans[0]?.tranCn ?? "").toString().trim();
    const altTranslations: string[] = trans
      .slice(1)
      .map((t) => (t?.tranCn ?? "").toString().trim())
      .filter((s) => s.length > 0);

    // POS: syno[0].pos takes priority (e.g. "n", "adj"); fallback to trans[0].pos
    const synoList: any[] = wordContent?.syno?.synos ?? [];
    let pos: string | undefined = undefined;
    if (synoList.length > 0 && typeof synoList[0]?.pos === "string") {
      pos = synoList[0].pos;
    } else if (typeof trans[0]?.pos === "string") {
      pos = trans[0].pos;
    }
    if (pos) pos = normalizePos(pos);

    out.push({
      headWord: headWord.trim(),
      pos,
      phonetic: {
        us: usphone?.trim() || undefined,
        uk: ukphone?.trim() || undefined,
      },
      translation:
        primaryTranslation ||
        // Some entries only have "tranOther" (English gloss) with no Chinese.
        // That's rare for PEP XiaoXue though. Fall back to empty string so
        // the merge stage can request a translation from Claude.
        "",
      altTranslations: altTranslations.length > 0 ? altTranslations : undefined,
      examples,
      grade,
      term,
    });
  }
  return out;
}

/** "n" -> "n.", "noun" -> "n.", "v." -> "v." */
function normalizePos(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/\./g, "");
  const map: Record<string, string> = {
    n: "n.",
    noun: "n.",
    v: "v.",
    verb: "v.",
    vt: "v.",
    vi: "v.",
    adj: "adj.",
    a: "adj.",
    adjective: "adj.",
    adv: "adv.",
    adverb: "adv.",
    prep: "prep.",
    preposition: "prep.",
    pron: "pron.",
    pronoun: "pron.",
    conj: "conj.",
    conjunction: "conj.",
    interj: "interj.",
    interjection: "interj.",
    num: "num.",
    numeral: "num.",
    art: "art.",
    article: "art.",
    det: "det.",
    determiner: "det.",
    phr: "phr.",
    phrase: "phr.",
  };
  return map[s] ?? (s ? `${s}.` : "");
}

/**
 * Download (if needed) + parse a single PEP ZIP file.
 */
async function loadPepZip(
  entry: (typeof PEP_FILES)[number]
): Promise<RawPepWord[]> {
  const zipPath = path.join(CACHE_DIR, `${entry.name}.zip`);
  await downloadCached(entry.url, zipPath);
  const buf = await readFileBuffer(zipPath);
  const zip = new AdmZip(buf);
  const entries = zip.getEntries();
  // Each of these ZIPs contains exactly one file named PEPXiaoXueX_Y.json.
  const jsonEntry =
    entries.find((e) => e.entryName.endsWith(".json")) ?? entries[0];
  if (!jsonEntry) return [];
  const text = jsonEntry.getData().toString("utf8");
  return parsePepNdjson(text, entry.grade, entry.term);
}

export interface FetchPepOptions {
  /** If set, only load these grades (e.g. only [3] for quick tests). */
  onlyGrades?: (3 | 4 | 5 | 6)[];
}

/** Top-level Stage A1 entry: returns the full RawPepWord[] across all 8 zips. */
export async function fetchKajwebPep(
  opts: FetchPepOptions = {}
): Promise<RawPepWord[]> {
  const files = opts.onlyGrades
    ? PEP_FILES.filter((f) => opts.onlyGrades!.includes(f.grade))
    : PEP_FILES;

  const all: RawPepWord[] = [];
  const counts: Record<string, number> = {};
  for (const entry of files) {
    try {
      const words = await loadPepZip(entry);
      counts[entry.name] = words.length;
      console.log(`[pep] ${entry.name}: parsed ${words.length} words`);
      all.push(...words);
    } catch (err) {
      console.error(`[pep] ${entry.name} failed:`, (err as Error).message);
      counts[entry.name] = 0;
    }
  }
  console.log(`[pep] total raw rows = ${all.length}`);
  return all;
}
