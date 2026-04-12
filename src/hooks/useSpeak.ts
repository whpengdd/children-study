// src/hooks/useSpeak.ts
//
// Thin wrapper around audioService for components that want a stable
// `speak(word)` callback + the first-gesture unlock helper. The unlock call
// works around iPad Safari's "first speechSynthesis call after mount must
// be inside a user gesture or it silently drops" quirk — callers install
// `unlock` onto a pointerdown / click handler on first render.

import { useCallback, useEffect, useRef } from "react";

import * as audioService from "../services/audioService";

export interface UseSpeakReturn {
  /** Speak a word via audioService. Accent pulled from settings if passed. */
  speak: (word: string, opts?: { accent?: "us" | "uk" }) => Promise<void>;
  /** Unlock speechSynthesis. Safe to call multiple times. */
  unlock: () => void;
  /** Cancel anything currently playing. */
  cancel: () => void;
}

export function useSpeak(defaultAccent: "us" | "uk" = "us"): UseSpeakReturn {
  // Track if we've unlocked yet — after the first call we don't need to keep
  // spamming unlock.
  const unlockedRef = useRef(false);

  const unlock = useCallback(() => {
    if (unlockedRef.current) return;
    unlockedRef.current = true;
    try {
      audioService.unlock();
    } catch (err) {
      console.warn("[useSpeak.unlock] failed:", err);
    }
  }, []);

  const speak = useCallback(
    async (word: string, opts?: { accent?: "us" | "uk" }) => {
      try {
        await audioService.speakWord(word, {
          accent: opts?.accent ?? defaultAccent,
        });
      } catch (err) {
        console.warn("[useSpeak.speak] failed:", err);
      }
    },
    [defaultAccent],
  );

  const cancel = useCallback(() => {
    try {
      audioService.cancel();
    } catch {
      /* ignore */
    }
  }, []);

  // Cancel any in-flight audio on unmount — prevents a leftover utterance
  // from bleeding into the next screen.
  useEffect(() => {
    return () => {
      try {
        audioService.cancel();
      } catch {
        /* ignore */
      }
    };
  }, []);

  return { speak, unlock, cancel };
}
