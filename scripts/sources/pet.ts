// scripts/sources/pet.ts
//
// Stage A3: download the Cambridge PET (B1 Preliminary) vocabulary list PDF
// and parse it to { headWord, pos }[].
//
// Cambridge English hosts two variants of the PET wordlist. The first one we
// try is the legacy 84669 PDF (still mirrored). If that fails, we fall back
// to the newer August 2025 506887 wordlist.

import * as path from "node:path";
import {
  downloadCached,
  fileExists,
  readJsonCache,
  writeJsonCache,
} from "../lib/cache.js";
import { parseVocabPdf, type PdfEntry } from "../lib/pdf-parser.js";

const CACHE_DIR = path.resolve(process.cwd(), ".cache");
const PDF_PATH = path.join(CACHE_DIR, "pdfs", "pet.pdf");
const JSON_CACHE_PATH = path.join(CACHE_DIR, "raw", "pet-entries.json");

// Primary Cambridge English PET vocabulary list PDF (legacy 84669).
// Source: https://www.cambridgeenglish.org/images/84669-pet-vocabulary-list.pdf
// Mirrors: the newer 506887 B1 Preliminary list at
//   https://www.cambridgeenglish.org/Images/506887-b1-preliminary-vocabulary-list.pdf
export const PET_PDF_URLS = [
  "https://www.cambridgeenglish.org/images/84669-pet-vocabulary-list.pdf",
  "https://www.cambridgeenglish.org/Images/506887-b1-preliminary-vocabulary-list.pdf",
];

export interface FetchPetOptions {
  force?: boolean;
  noAi?: boolean;
}

export async function fetchCambridgePet(
  opts: FetchPetOptions = {}
): Promise<PdfEntry[]> {
  if (!opts.force) {
    const cached = await readJsonCache<PdfEntry[]>(JSON_CACHE_PATH);
    if (cached && cached.length > 0) {
      console.log(`[pet] cache hit: ${cached.length} entries`);
      return cached;
    }
  }

  // Try each URL until one downloads.
  let downloaded = false;
  if (await fileExists(PDF_PATH)) {
    downloaded = true;
  } else {
    for (const url of PET_PDF_URLS) {
      try {
        await downloadCached(url, PDF_PATH, { force: opts.force });
        downloaded = true;
        console.log(`[pet] downloaded from ${url}`);
        break;
      } catch (err) {
        console.warn(`[pet] ${url} failed: ${(err as Error).message}`);
      }
    }
  }
  if (!downloaded) {
    console.error("[pet] all PDF URLs failed — returning empty list");
    return [];
  }

  console.log("[pet] parsing PDF...");
  const entries = await parseVocabPdf(PDF_PATH, {
    minExpected: 1500,
    disableAiFallback: opts.noAi,
  });
  console.log(`[pet] final ${entries.length} entries`);
  await writeJsonCache(JSON_CACHE_PATH, entries);
  return entries;
}
