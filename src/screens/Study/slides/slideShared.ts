// src/screens/Study/slides/slideShared.ts
//
// Thin helpers used by every slide. `speak` delegates to audioService which
// tries Web Speech API first and falls back to YouDao dictvoice audio.

import { speakWord } from "../../../services/audioService";

/**
 * Speak a word or short phrase. Delegates to audioService (Web Speech +
 * YouDao fallback). Fire-and-forget — callers don't await.
 */
export function speak(text: string): void {
  speakWord(text).catch(() => {
    // best-effort; audioService already logs warnings internally
  });
}

/**
 * Same as `speak` but returns a promise that resolves after the audio has
 * finished playing (or a hard timeout cap fires). Tier-1 slides await this
 * to keep the carousel from advancing before the kid actually hears the line.
 */
export async function speakAndWait(text: string): Promise<void> {
  try {
    await speakWord(text);
  } catch {
    /* best-effort; never reject */
  }
}

/**
 * Sleep for `ms` but resolve early if the cleanup-controlled `cancelled`
 * predicate flips true. Tier-1 slides chain `speakAndWait` + `delay` and need
 * to abort cleanly when React unmounts the slide mid-sequence.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

/**
 * Normalise a free-text answer for comparison: lowercase, trim, collapse
 * whitespace, strip trailing punctuation.
 */
export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[.!?,;:]+$/g, "")
    .replace(/\s+/g, " ");
}

export type MCQState = "idle" | "correct" | "wrong";
