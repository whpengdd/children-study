// src/screens/Study/slides/SentenceSlide.tsx
//
// Tier 1 passive exposure — read a full example sentence to the learner.
// Autoplays once on mount, then lets the user tap to replay. Advance is
// owned by StudyScreen's useAutoCarousel, not by this slide.

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import type { Scenario, Word } from "../../../types";
import { speak } from "./slideShared";

interface Props {
  scenario: Extract<Scenario, { kind: "sentence" }>;
  word: Word;
  onExposureDone: () => void;
  disabled?: boolean;
}

export default function SentenceSlide({ scenario, word }: Props) {
  const [playCount, setPlayCount] = useState(0);

  useEffect(() => {
    // Autoplay once on mount.
    speak(scenario.text);
    setPlayCount((c) => c + 1);
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
