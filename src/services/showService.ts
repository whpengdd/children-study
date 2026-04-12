// src/services/showService.ts
//
// Dispatches a "pet Show" when a skill is triggered. Strategy:
//   1. Load the pet + resolve generation mode from settings.
//   2. If full mode (or saving mode + within daily quota) → try Claude.
//   3. On any error (including NoApiKeyError) → fall through to the template
//      library. The child never sees "Show failed"; the pet always performs.
//
// All persistence writes to the Dexie `shows` table, which future screens can
// read to rehydrate past performances.

import { db } from "../data/db";
import {
  loadIndex,
  loadTemplate,
  pickVariant,
  renderTemplate,
  type ShowIndexEntry,
} from "../data/templateLoader";
import type {
  GenerationMode,
  Pet,
  PetSkill,
  Settings,
  Show,
  ShowScriptStep,
  WordProgress,
} from "../types";

import { generateJson } from "./claudeClient";

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/** Thrown only from the narrow "the pet doesn't exist" case. Never surfaces to the user. */
export class ShowDispatchError extends Error {}

// ---------------------------------------------------------------------------
// Mode resolution
// ---------------------------------------------------------------------------

/**
 * Decide the effective generation mode, given a settings row (or null).
 * Falls to "offline" any time there's no API key.
 */
export function resolveGenerationMode(
  settings: Settings | null | undefined,
): GenerationMode {
  if (!settings) return "offline";
  if (!settings.anthropicApiKey) return "offline";
  return settings.showGenerationMode;
}

// ---------------------------------------------------------------------------
// Recent-words helper
// ---------------------------------------------------------------------------

/**
 * Fetch the profile's most recently graduated words (tier === 5), ordered
 * roughly by the last lastSeenAt timestamp — a cheap proxy for "graduated at".
 * We use this to sprinkle the child's words into templates and Claude prompts.
 */
export async function fetchRecentGraduatedWords(
  profileId: number,
  limit = 10,
): Promise<string[]> {
  // Dexie compound index [profileId+tier] gives us tier-5 rows fast.
  const rows: WordProgress[] = await db.wordProgress
    .where("[profileId+tier]")
    .equals([profileId, 5])
    .toArray();
  rows.sort((a, b) => (b.lastSeenAt > a.lastSeenAt ? 1 : -1));
  return rows.slice(0, limit).map((r) => r.wordId);
}

// ---------------------------------------------------------------------------
// Daily quota
// ---------------------------------------------------------------------------

/**
 * Returns true when the profile hasn't yet hit their daily AI-show cap.
 */
export async function withinDailyQuota(profileId: number): Promise<boolean> {
  const settings = await db.settings.get(profileId);
  if (!settings) return true;
  const quota = settings.dailyShowAiQuota ?? 1;

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayStartIso = dayStart.toISOString();

  const todays = await db.shows
    .where("[profileId+createdAt]")
    .between([profileId, dayStartIso], [profileId, "\uffff"])
    .toArray();
  const aiCount = todays.filter((s) => s.source === "ai").length;
  return aiCount < quota;
}

// ---------------------------------------------------------------------------
// Claude dispatch
// ---------------------------------------------------------------------------

const SCHEMA_HINT = `{
  "script": [
    { "kind": "say"|"emote"|"action"|"speak_word"|"wait", "text"?: string, "emoji"?: string, "ms"?: number, "word"?: string }
  ]
}`;

interface ClaudeShowResponse {
  script: ShowScriptStep[];
}

/**
 * Prompt Claude for a script. The prompt is short so we don't burn tokens on
 * preamble; the system prompt in claudeClient.ts already enforces JSON-only.
 */
function buildShowPrompt(
  pet: Pet,
  skill: PetSkill,
  recentWords: string[],
): string {
  const words = recentWords.length > 0 ? recentWords.join(", ") : "(none yet)";
  return [
    `Generate a short performance script for a ${pet.species} pet at stage "${pet.stage}".`,
    `The skill is "${skill.name}" (kind: ${skill.kind}).`,
    `Recent English words the child has learned: ${words}.`,
    ``,
    `Return a JSON object with a "script" array of 8–12 steps.`,
    `Each step has "kind" ("say" | "emote" | "action" | "speak_word" | "wait"),`,
    `and optional "text" (bilingual EN + 中文), "emoji", "ms" (display ms), "word" (for speak_word).`,
    `For speak_word steps, the "word" value MUST be one of the recent words above.`,
    `Keep it playful and age-appropriate for a 6-10 year old learner.`,
  ].join("\n");
}

export async function generateShowViaClaude(
  pet: Pet,
  skill: PetSkill,
  recentWords: string[],
): Promise<Show> {
  const prompt = buildShowPrompt(pet, skill, recentWords);
  const response = await generateJson<ClaudeShowResponse>(prompt, {
    profileId: pet.profileId,
    schemaHint: SCHEMA_HINT,
    maxTokens: 1500,
  });

  if (!response || !Array.isArray(response.script) || response.script.length === 0) {
    throw new Error("Claude returned an empty or malformed show script");
  }

  // Defensive normalization: make sure every step has a valid kind.
  const validKinds = new Set(["say", "emote", "action", "speak_word", "wait"]);
  const script: ShowScriptStep[] = response.script
    .filter((step) => step && validKinds.has(step.kind))
    .map((step) => ({
      kind: step.kind,
      text: typeof step.text === "string" ? step.text : undefined,
      emoji: typeof step.emoji === "string" ? step.emoji : undefined,
      ms: typeof step.ms === "number" ? step.ms : undefined,
      word: typeof step.word === "string" ? step.word : undefined,
    }));

  if (script.length === 0) {
    throw new Error("Claude returned no valid script steps");
  }

  return {
    profileId: pet.profileId,
    skillId: skill.id,
    script,
    source: "ai",
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Template dispatch
// ---------------------------------------------------------------------------

/**
 * Offline path: pick a template variant for this skill and substitute in
 * recent words. Throws only if the skill isn't in `index.json` AND has no
 * matching template stem (a coding error, not a runtime failure).
 */
export async function loadTemplateShow(
  profileId: number,
  skill: PetSkill,
  recentWords: string[],
): Promise<Show> {
  let indexEntry: ShowIndexEntry | undefined;
  try {
    const index = await loadIndex();
    indexEntry = index[skill.id];
  } catch {
    /* fall through — we can still attempt to load a file by skill.id */
  }

  // Candidate template stems: use the index if present, else default to skill.id.
  const candidates =
    indexEntry?.templates && indexEntry.templates.length > 0
      ? indexEntry.templates
      : [skill.id];

  let lastErr: unknown = null;
  for (const stem of candidates) {
    try {
      const template = await loadTemplate(stem);
      const variant = pickVariant(template);
      return renderTemplate(variant, recentWords, {
        profileId,
        skillId: skill.id,
      });
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `No template found for skill "${skill.id}" (candidates: ${candidates.join(", ")}). Last error: ${String(
      lastErr,
    )}`,
  );
}

// ---------------------------------------------------------------------------
// Main dispatch
// ---------------------------------------------------------------------------

/**
 * Build (and persist) a show for the given profile/skill. Full error-tolerant
 * waterfall: AI first (when enabled), template on any failure.
 */
export async function triggerShow(
  profileId: number,
  skillId: string,
): Promise<Show> {
  const pet = await db.pets.get(profileId);
  if (!pet) throw new ShowDispatchError(`No pet for profile ${profileId}`);

  // Resolve the skill — prefer one unlocked on the pet, fall back to a stub
  // so we can still play a template if Wave 2 passes a raw skill id.
  const ownedSkill = pet.skills.find((s) => s.id === skillId);
  const skill: PetSkill = ownedSkill ?? {
    id: skillId,
    name: skillId,
    unlockAt: 0,
    kind: "trick",
  };

  const settings = await db.settings.get(profileId);
  const mode = resolveGenerationMode(settings);
  const recentWords = await fetchRecentGraduatedWords(profileId, 10);

  let show: Show | null = null;
  try {
    if (
      mode === "full" ||
      (mode === "saving" && (await withinDailyQuota(profileId)))
    ) {
      show = await generateShowViaClaude(pet, skill, recentWords);
    }
  } catch (err) {
    // Intentionally swallow — template fallback below.
    // eslint-disable-next-line no-console
    console.warn("[showService] AI show generation failed, using template", err);
  }

  if (!show) {
    show = await loadTemplateShow(profileId, skill, recentWords);
  }

  // Persist to the shows table and bump lastShowAt + event log.
  const id = await db.shows.add(show);
  show.id = id as unknown as number;

  const nowIso = new Date().toISOString();
  pet.lastShowAt = nowIso;
  await db.pets.put(pet);
  await db.petEvents.add({
    profileId,
    ts: nowIso,
    kind: "show",
    payload: {
      skillId: skill.id,
      source: show.source,
      stepCount: show.script.length,
    },
  });

  return show;
}
