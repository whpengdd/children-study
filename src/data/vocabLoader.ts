// src/data/vocabLoader.ts
//
// Loads the static catalog + per-path index files from /public/data and
// memoizes results in-memory. Every caller goes through these two functions,
// so if we ever move to chunked loading we only touch this file.

import type { Catalog, Exam, PepGrade } from "../types/vocab";

const CATALOG_URL = "/data/catalog.json";

let catalogPromise: Promise<Catalog> | null = null;
const indexCache = new Map<string, Promise<string[]>>();

/**
 * Fetch + memoize `/public/data/catalog.json`. On failure, returns a synthetic
 * empty catalog so the UI can render instead of bricking on a 404.
 */
export function loadCatalog(): Promise<Catalog> {
  if (!catalogPromise) {
    catalogPromise = fetch(CATALOG_URL)
      .then(async (res) => {
        if (!res.ok) throw new Error(`catalog.json ${res.status}`);
        return (await res.json()) as Catalog;
      })
      .catch((err) => {
        // Don't poison the cache permanently — allow a retry next mount.
        catalogPromise = null;
        console.warn("[vocabLoader] loadCatalog failed:", err);
        return emptyCatalog();
      });
  }
  return catalogPromise;
}

/** Force-reset the in-memory catalog cache (tests / manual refresh). */
export function resetCatalogCache(): void {
  catalogPromise = null;
  indexCache.clear();
}

/**
 * Load a path-specific word-id index. The real pipeline may emit e.g.
 * `/data/index/pep-grade3.json` as a plain `string[]`, falling back to the
 * embedded `byPepGrade` / `byExam` indexes if the file is missing.
 */
export function loadIndex(
  kind: "pep-grade",
  arg: PepGrade,
): Promise<string[]>;
export function loadIndex(kind: "exam", arg: Exam): Promise<string[]>;
export function loadIndex(
  kind: "pep-grade" | "exam",
  arg: PepGrade | Exam,
): Promise<string[]> {
  const fileStem = kind === "pep-grade" ? `pep-grade${arg}` : String(arg);
  const cacheKey = `${kind}:${fileStem}`;
  let cached = indexCache.get(cacheKey);
  if (!cached) {
    cached = fetch(`/data/index/${fileStem}.json`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`index ${fileStem} ${res.status}`);
        const json = await res.json();
        return Array.isArray(json) ? (json as string[]) : [];
      })
      .catch(async () => {
        // Graceful fallback: use the embedded indexes in catalog.json.
        const catalog = await loadCatalog();
        if (kind === "pep-grade") {
          return catalog.byPepGrade?.[arg as PepGrade] ?? [];
        }
        return catalog.byExam?.[arg as Exam] ?? [];
      });
    indexCache.set(cacheKey, cached);
  }
  return cached;
}

function emptyCatalog(): Catalog {
  return {
    generatedAt: new Date(0).toISOString(),
    words: [],
    byPepGrade: { 3: [], 4: [], 5: [], 6: [] },
    byExam: { KET: [], PET: [] },
  };
}
