// src/types/show.ts
//
// A pet "Show" is a short scripted performance the pet puts on when a skill is
// triggered from PetHome. showService generates it either via Claude API (full
// / saving modes) or by loading a template from /public/shows/templates/.

import type { PetSkill } from "./pet";

export interface ShowScriptStep {
  kind: "say" | "emote" | "action" | "speak_word" | "wait";
  /** Bilingual dialog text for `say`. */
  text?: string;
  /** Emoji for `emote` / `action`. */
  emoji?: string;
  /** Duration in ms for `wait`, or the display time for other steps. */
  ms?: number;
  /** When kind === "speak_word": which vocabulary word to read aloud. */
  word?: string;
}

export interface Show {
  /** Dexie auto-increment primary key. */
  id?: number;
  profileId: number;
  /** Skill that triggered this show. */
  skillId: string;
  /** Step-by-step playback script. */
  script: ShowScriptStep[];
  /** Whether this show came from Claude API or the bundled template library. */
  source: "ai" | "template";
  createdAt: string;
}

export interface ShowRequest {
  profileId: number;
  petId: string;
  skill: PetSkill;
  /** Most recent graduated words. Used to personalize the show. */
  recentWords: string[];
  ambientLevel: GenerationMode;
}

/**
 * - offline: never call Claude; always load a template.
 * - saving:  call Claude at most N times per day (see Settings.dailyShowAiQuota),
 *            fall back to template otherwise.
 * - full:    call Claude on every triggerShow; template is failure-fallback only.
 */
export type GenerationMode = "offline" | "saving" | "full";
