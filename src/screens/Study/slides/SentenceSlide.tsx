// src/screens/Study/slides/SentenceSlide.tsx
//
// Tier 1 passive exposure — read a full example sentence to the learner.
// Autoplays on mount and only signals `onExposureDone` AFTER the audio has
// actually finished, so the carousel doesn't preempt the kid hearing the line.

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

import type { Scenario, Word } from "../../../types";
import { delay, speak, speakAndWait } from "./slideShared";

interface Props {
  scenario: Extract<Scenario, { kind: "sentence" }>;
  word: Word;
  onExposureDone: () => void;
  disabled?: boolean;
}

/** Cushion after the sentence finishes before we hand off to the carousel. */
const POST_SPEECH_MS = 800;

export default function SentenceSlide({ scenario, word, onExposureDone }: Props) {
  const [playCount, setPlayCount] = useState(0);

  // Stash the callback so changing it doesn't re-trigger the autoplay effect.
  const doneRef = useRef(onExposureDone);
  useEffect(() => {
    doneRef.current = onExposureDone;
  }, [onExposureDone]);

  useEffect(() => {
    let cancelled = false;
    setPlayCount((c) => c + 1);
    (async () => {
      await speakAndWait(scenario.text);
      if (cancelled) return;
      await delay(POST_SPEECH_MS);
      if (cancelled) return;
      doneRef.current();
    })();
    return () => {
      cancelled = true;
    };
  }, [scenario.text]);

  const handleReplay = () => {
    speak(scenario.text);
    setPlayCount((c) => c + 1);
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      className="flex h-full w-full flex-col items-center justify-center gap-8 p-8"
    >
      <div className="text-sm font-medium uppercase tracking-widest text-indigo-400">
        {word.headWord}
      </div>
      <p className="max-w-3xl text-center text-4xl font-semibold leading-snug text-slate-800 md:text-5xl">
        {scenario.text}
      </p>
      <p className="max-w-2xl text-center text-xl text-slate-500 md:text-2xl">
        {scenario.cn}
      </p>
      <button
        type="button"
        onClick={handleReplay}
        className="flex min-h-16 items-center gap-3 rounded-2xl bg-indigo-500 px-8 py-4 text-xl font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-600 active:scale-95"
        aria-label="Replay sentence"
      >
        <span aria-hidden>🔊</span>
        <span>再听一遍</span>
        <span className="text-sm opacity-70">({playCount})</span>
      </button>
    </motion.div>
  );
}
