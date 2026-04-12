// scripts/sources/cefrj.ts
//
// Stage A4: download the CEFR-J vocabulary profile CSV and parse to
// { headWord, pos, cefr }[]. We use this as a cross-reference to fill
// Word.tags.cefr when the source PEP / KET / PET entry didn't set one.
//
// Source:
//   https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/cefrj-vocabulary-profile-1.5.csv

import * as path from "node:path";
import {
  downloadCached,
  readFileBuffer,
  readJsonCache,
  writeJsonCache,
} from "../lib/cache.js";

const CACHE_DIR = path.resolve(process.cwd(), ".cache");
const CSV_PATH = path.join(CACHE_DIR, "csv", "cefrj.csv");
const JSON_CACHE_PATH = path.join(CACHE_DIR, "raw", "cefrj-entries.json");

export const CEFRJ_URL =
  "https://raw.githubusercontent.com/openlanguageprofiles/olp-en-cefrj/master/cefrj-vocabulary-profile-1.5.csv";

export interface CefrjEntry {
  headWord: string;
  pos?: string;
  cefr?: "A1" | "A2" | "B1" | "B2";
}

/**
 * Very small CSV parser: handles quoted fields with embedded commas + escaped
 * quotes. No external dependency needed — the CEFR-J file is well-behaved.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cur.push(field);
        field = "";
      } else if (ch === "\n") {
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = "";
      } else if (ch === "\r") {
        // skip
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  return rows;
}

function normalizePos(raw: string): string | undefined {
  const s = raw.trim().toLowerCase().replace(/\./g, "");
  if (!s) return undefined;
  const map: Record<string, string> = {
    n: "n.",
    noun: "n.",
    v: "v.",
    verb: "v.",
    vt: "v.",
    vi: "v.",
    adj: "adj.",
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
    num: "num.",
    det: "det.",
    art: "art.",
    phr: "phr.",
    exclam: "exclam.",
    modal: "modal",
  };
  return map[s] ?? `${s}.`;
}

function normalizeCefr(raw: string): "A1" | "A2" | "B1" | "B2" | undefined {
  const s = raw.trim().toUpperCase();
  if (s === "A1" || s === "A2" || s === "B1" || s === "B2") return s;
  return undefined;
}

export interface FetchCefrjOptions {
  force?: boolean;
}

export async function fetchCefrj(
  opts: FetchCefrjOptions = {}
): Promise<CefrjEntry[]> {
  if (!opts.force) {
    const cached = await readJsonCache<CefrjEntry[]>(JSON_CACHE_PATH);
    if (cached && cached.length > 0) {
      console.log(`[cefrj] cache hit: ${cached.length} entries`);
      return cached;
    }
  }
  await downloadCached(CEFRJ_URL, CSV_PATH, { force: opts.force });
  const buf = await readFileBuffer(CSV_PATH);
  const text = buf.toString("utf8");
  const rows = parseCsv(text);
  if (rows.length === 0) {
    console.error("[cefrj] empty CSV");
    return [];
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const headCol = header.findIndex((h) => h === "headword" || h === "word");
  const posCol = header.findIndex((h) => h === "pos" || h === "part-of-speech");
  const cefrCol = header.findIndex(
    (h) => h === "cefr" || h === "level" || h === "band" || h === "cefr level"
  );

  const out: CefrjEntry[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const headWord = (row[headCol] ?? "").trim().toLowerCase();
    if (!headWord || headWord.length < 2) continue;
    const pos =
      posCol >= 0 ? normalizePos((row[posCol] ?? "").trim()) : undefined;
    const cefr =
      cefrCol >= 0 ? normalizeCefr((row[cefrCol] ?? "").trim()) : undefined;
    out.push({ headWord, pos, cefr });
  }
  console.log(`[cefrj] parsed ${out.length} entries`);
  await writeJsonCache(JSON_CACHE_PATH, out);
  return out;
}
