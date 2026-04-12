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
