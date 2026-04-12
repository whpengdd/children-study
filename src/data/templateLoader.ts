// src/data/templateLoader.ts
//
// Loads the offline show template library from /public/shows/templates/. Used
// by showService whenever we can't (or don't want to) call Claude. The loader
// memoizes both the skill→template index AND individual templates so we only
// hit the network once per file per session.

import type { Show, ShowScriptStep } from "../types";

/**
 * A single "variant" the template file can offer. Each entry in the JSON file
 * root array is one of these.
 */
export interface ShowTemplateVariant {
  name: string;
  script: ShowScriptStep[];
}

/** The shape of a template file: an array of variants. */
export type ShowTemplate = ShowTemplateVariant[];

/**
 * The index.json file maps a skill id to its metadata: kind, candidate
 * template file names, and the unlock rule.  `unlockAt` is duplicated from
 * the petService SKILL_CATALOG as a convenience for Wave 2 UI that displays
 * "unlock at N graduated words" on locked skills.
 */
export interface ShowIndexEntry {
  kind: "song" | "dance" | "trick" | "story";
  /** Template file stems under /shows/templates/ (no `.json`). */
  templates: string[];
  unlockAt: {
    graduatedCount?: number;
    stage?: "egg" | "baby" | "child" | "teen" | "adult";
  };
}

export type SkillToTemplateMap = Record<string, ShowIndexEntry>;

// ---------------------------------------------------------------------------
// Memoized loaders
// ---------------------------------------------------------------------------

/** Cache of loaded templates, keyed by file stem. */
const templateCache = new Map<string, ShowTemplate>();
/** One-shot promise for index.json to avoid thundering herds. */
let indexPromise: Promise<SkillToTemplateMap> | null = null;

/** Base URL for the public shows folder. */
const SHOWS_BASE = "/shows";

/**
 * Wraps `fetch` so tests can swap it out. Vitest / tsx without DOM can
 * monkey-patch `globalThis.fetch` to return fixtures.
 */
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function loadIndex(): Promise<SkillToTemplateMap> {
  if (!indexPromise) {
    indexPromise = fetchJson<SkillToTemplateMap>(`${SHOWS_BASE}/index.json`);
  }
  return indexPromise;
}

/**
 * Load a single template file by its stem (no extension). Memoized. Returns
 * an ARRAY of variants; callers usually pick a random one.
 */
export async function loadTemplate(
  templateStem: string,
): Promise<ShowTemplate> {
  const cached = templateCache.get(templateStem);
  if (cached) return cached;
  const template = await fetchJson<ShowTemplate>(
    `${SHOWS_BASE}/templates/${templateStem}.json`,
  );
  templateCache.set(templateStem, template);
  return template;
}

/**
 * Take a raw template variant and substitute `{{word1}}`, `{{word2}}`, ...
 * placeholders with the child's recent graduated words. If there are fewer
 * recent words than placeholders, we reuse from the start — a show with
 * duplicate words is still better than a show with literal `{{word3}}`.
 */
export function renderTemplate(
  variant: ShowTemplateVariant,
  recentWords: string[],
  meta: {
    profileId: number;
    skillId: string;
  },
): Show {
  const fallbackWord = "word"; // if recentWords is totally empty
  const wordAt = (idx: number): string => {
    if (recentWords.length === 0) return fallbackWord;
    return recentWords[idx % recentWords.length]!;
  };
  /** Replace every occurrence of {{wordN}} in a string. */
  const substitute = (s: string | undefined): string | undefined => {
    if (!s) return s;
    return s.replace(/\{\{word(\d+)\}\}/g, (_match, nStr: string) => {
      const n = Number.parseInt(nStr, 10);
      if (Number.isNaN(n) || n < 1) return _match;
      return wordAt(n - 1);
    });
  };

  const script: ShowScriptStep[] = variant.script.map((step) => ({
    ...step,
    text: substitute(step.text),
    word: substitute(step.word),
  }));

  return {
    profileId: meta.profileId,
    skillId: meta.skillId,
    script,
    source: "template",
    createdAt: new Date().toISOString(),
  };
}

/**
 * Convenience: pick a random variant from a template file and render it. Used
 * by showService after it loads the index and picks a template stem.
 */
export function pickVariant(template: ShowTemplate, seed?: number): ShowTemplateVariant {
  if (template.length === 0) {
    throw new Error("Template has no variants");
  }
  const idx =
    seed === undefined
      ? Math.floor(Math.random() * template.length)
      : Math.abs(Math.trunc(seed)) % template.length;
  return template[idx]!;
}

/** Test helper — reset memoization. Not used in production. */
export function __resetTemplateCacheForTests(): void {
  templateCache.clear();
  indexPromise = null;
}
