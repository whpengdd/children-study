// src/types/settings.ts
//
// One row per profile, keyed by `profileId` in the Dexie `settings` table.

import type { GenerationMode } from "./show";

export interface Settings {
  profileId: number;

  /** True = "挂机" mode: Tier 2–4 auto-skip after 15 s instead of waiting. */
  ambientMode: boolean;
  /** Seconds to linger on each Tier 1 card before auto-advancing. */
  carouselSpeed: "slow" | "normal" | "fast";
  /** TTS voice preference. */
  voiceAccent: "us" | "uk";
  /** Cap on fresh words per session (5–30 typical). */
  maxNewWordsPerSession: number;
  /**
   * How far into the future to pull due FSRS cards for the current session,
   * in ms. Typical value is one day.
   */
  dueLookaheadMs: number;

  /**
   * Optional. When the parent pastes their own key in the Settings screen we
   * store it per-profile so multiple children on the same pad don't leak
   * credentials to each other.
   */
  anthropicApiKey?: string;
  /** Show generation mode; defaults to "offline" if no key is set. */
  showGenerationMode: GenerationMode;
  /** Max number of AI show generations per day in "saving" mode. */
  dailyShowAiQuota: number;
}
