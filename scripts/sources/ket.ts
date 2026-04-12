// scripts/sources/ket.ts
//
// Stage A2: download the Cambridge KET (A2 Key) vocabulary list PDF and parse
// it to { headWord, pos }[]. Caches both the PDF and the parsed JSON.

import * as path from "node:path";
import {
  downloadCached,
  readJsonCache,
  writeJsonCache,
} from "../lib/cache.js";
import { parseVocabPdf, type PdfEntry } from "../lib/pdf-parser.js";

const CACHE_DIR = path.resolve(process.cwd(), ".cache");
const PDF_PATH = path.join(CACHE_DIR, "pdfs", "ket.pdf");
const JSON_CACHE_PATH = path.join(CACHE_DIR, "raw", "ket-entries.json");

// Official Cambridge English A2 Key vocabulary list PDF.
// Source: https://www.cambridgeenglish.org/images/22105-ket-vocabulary-list.pdf
export const KET_PDF_URL =
  "https://www.cambridgeenglish.org/images/22105-ket-vocabulary-list.pdf";

export interface FetchKetOptions {
  /** Force redownload + reparse. */
  force?: boolean;
  /** Skip Claude fallback inside the PDF parser. */
  noAi?: boolean;
}

export async function fetchCambridgeKet(
  opts: FetchKetOptions = {}
): Promise<PdfEntry[]> {
  if (!opts.force) {
    const cached = await readJsonCache<PdfEntry[]>(JSON_CACHE_PATH);
    if (cached && cached.length > 0) {
      console.log(`[ket] cache hit: ${cached.length} entries`);
      return cached;
    }
  }
  await downloadCached(KET_PDF_URL, PDF_PATH, { force: opts.force });
  console.log("[ket] parsing PDF...");
  const entries = await parseVocabPdf(PDF_PATH, {
    minExpected: 1000,
    disableAiFallback: opts.noAi,
  });
  console.log(`[ket] final ${entries.length} entries`);
  await writeJsonCache(JSON_CACHE_PATH, entries);
  return entries;
}
