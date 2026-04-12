// scripts/fetch-vocab.ts
//
// Top-level orchestrator for the vocab pipeline:
//   A1: PEP   — download + parse 8 PEPXiaoXue ZIPs from kajweb/dict
//   A2: KET   — download + parse Cambridge KET wordlist PDF
//   A3: PET   — download + parse Cambridge PET wordlist PDF
//   A4: CEFRJ — download + parse CEFR-J vocabulary profile CSV
//   A5: merge — dedupe by (headWord+pos), combine tags, build placeholder Word[]
//   B:  gen   — fill Tier 2-4 scenarios from Claude (skipped in --no-ai mode)
//   C:  write — assembleCatalog() → public/data/catalog.json + per-path indices
//
// CLI flags:
//   --no-ai        Skip Stage B and the PDF parser's Claude fallback.
//   --only-pep     Run PEP source. Additive with other --only-* flags.
//   --only-ket     Run KET source. Additive with other --only-* flags.
//   --only-pet     Run PET source. Additive with other --only-* flags.
//                  (Pass any one --only-* to exclude the others; pass multiple
//                   to include just those; pass none to run all three.)
//   --grade=N      Restrict to PEP grade N words only (N in 3..6). Applied
//                  after merge, so combine with --only-pep for a focused run.
//   --limit=N      Cap number of words that go into Stage B + assembly.

import * as path from "node:path";
import { writeJsonCache } from "./lib/cache.js";
import { fetchKajwebPep } from "./sources/pep.js";
import { fetchCambridgeKet } from "./sources/ket.js";
import { fetchCambridgePet } from "./sources/pet.js";
import { fetchCefrj } from "./sources/cefrj.js";
import { mergeAll } from "./merge.js";
import { enrichWithScenarios } from "./generate-scenarios.js";
import type {
  Cefr,
  Catalog,
  Exam,
  PepGrade,
  Word,
} from "../src/types/vocab.js";

const PUBLIC_DATA_DIR = path.resolve(process.cwd(), "public/data");
const CATALOG_OUT = path.join(PUBLIC_DATA_DIR, "catalog.json");
const INDEX_DIR = path.join(PUBLIC_DATA_DIR, "index");

// ------------------------------ CLI flags ------------------------------
interface Args {
  noAi: boolean;
  onlyPep: boolean;
  onlyKet: boolean;
  onlyPet: boolean;
  limit?: number;
  grade?: PepGrade;
}
function parseArgs(argv: string[]): Args {
  const out: Args = {
    noAi: false,
    onlyPep: false,
    onlyKet: false,
    onlyPet: false,
  };
  for (const a of argv) {
    if (a === "--no-ai") out.noAi = true;
    else if (a === "--only-pep") out.onlyPep = true;
    else if (a === "--only-ket") out.onlyKet = true;
    else if (a === "--only-pet") out.onlyPet = true;
    else if (a.startsWith("--limit=")) {
      const n = parseInt(a.slice("--limit=".length), 10);
      if (Number.isFinite(n) && n > 0) out.limit = n;
    } else if (a.startsWith("--grade=")) {
      const n = parseInt(a.slice("--grade=".length), 10);
      if (n === 3 || n === 4 || n === 5 || n === 6) out.grade = n as PepGrade;
    }
  }
  return out;
}

// ------------------------------ assembleCatalog ------------------------------
export function assembleCatalog(words: Word[]): Catalog {
  const byPepGrade: Record<PepGrade, string[]> = { 3: [], 4: [], 5: [], 6: [] };
  const byExam: Record<Exam, string[]> = { KET: [], PET: [] };

  for (const w of words) {
    if (w.tags.pepGrade !== undefined) {
      byPepGrade[w.tags.pepGrade].push(w.id);
    }
    for (const e of w.tags.exam) {
      byExam[e].push(w.id);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    words,
    byPepGrade,
    byExam,
  };
}

async function writeCatalog(catalog: Catalog): Promise<void> {
  await writeJsonCache(CATALOG_OUT, catalog);
  console.log(`[write] ${CATALOG_OUT} (${catalog.words.length} words)`);
}

async function writeIndexFiles(catalog: Catalog): Promise<void> {
  const indices: Record<string, string[]> = {
    "pep-grade3": catalog.byPepGrade[3],
    "pep-grade4": catalog.byPepGrade[4],
    "pep-grade5": catalog.byPepGrade[5],
    "pep-grade6": catalog.byPepGrade[6],
    ket: catalog.byExam.KET,
    pet: catalog.byExam.PET,
  };
  for (const [name, ids] of Object.entries(indices)) {
    const p = path.join(INDEX_DIR, `${name}.json`);
    await writeJsonCache(p, ids);
    console.log(`[write] ${p} (${ids.length} ids)`);
  }
}

// ------------------------------ main ------------------------------
async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[fetch-vocab] args: ${JSON.stringify(args)}`);

  // Determine which sources to run. --only-* flags are additive: if none are
  // set we run all three; if any are set we run just those.
  const anyOnly = args.onlyPep || args.onlyKet || args.onlyPet;
  const runPep = !anyOnly || args.onlyPep;
  const runKet = !anyOnly || args.onlyKet;
  const runPet = !anyOnly || args.onlyPet;

  const pep = runPep ? await fetchKajwebPep() : [];
  const ket = runKet
    ? await fetchCambridgeKet({ noAi: args.noAi })
    : [];
  const pet = runPet
    ? await fetchCambridgePet({ noAi: args.noAi })
    : [];
  // CEFR-J is a cheap cross-reference — always run it.
  const cefrj = await fetchCefrj();

  const { words: merged, stats } = await mergeAll({
    pep,
    ket,
    pet,
    cefrj,
  });
  console.log(`[fetch-vocab] merged ${merged.length} unique words`);

  let filtered = merged;
  if (args.grade !== undefined) {
    const before = filtered.length;
    filtered = filtered.filter((w) => w.tags.pepGrade === args.grade);
    console.log(
      `[fetch-vocab] --grade=${args.grade} filter: ${filtered.length}/${before} words`
    );
  }
  const targeted = args.limit ? filtered.slice(0, args.limit) : filtered;

  const enriched = await enrichWithScenarios(targeted, {
    noAi: args.noAi,
    limit: args.limit,
  });

  const catalog = assembleCatalog(enriched);
  await writeCatalog(catalog);
  await writeIndexFiles(catalog);

  // Persist the merge stats alongside for convenience.
  await writeJsonCache(
    path.join(path.resolve(process.cwd(), ".cache/raw"), "merge-stats.json"),
    stats
  );

  console.log("[fetch-vocab] done.");
}

main().catch((err) => {
  console.error("[fetch-vocab] FAILED:", err);
  process.exit(1);
});
