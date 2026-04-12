// src/screens/Study/slides/ImageSlide.tsx
//
// Tier 1 passive exposure — show a huge emoji + caption + Chinese translation.
// Pairs the visual with TTS of the headWord. Advance is owned by StudyScreen's
// useAutoCarousel, not by this slide.

import { useEffect } from "react";
import { motion } from "framer-motion";

import type { Scenario, Word } from "../../../types";
import { speak } from "./slideShared";

interface Props {
  scenario: Extract<Scenario, { kind: "image" }>;
  word: Word;
  onExposureDone: () => void;
  disabled?: boolean;
}

export default function ImageSlide({ scenario, word }: Props) {
  useEffect(() => {
    speak(word.headWord);
  }, [word.headWord]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex h-full w-full flex-col items-center justify-center gap-6 p-8"
    >
      <div className="text-sm font-medium uppercase tracking-widest text-indigo-400">
        {word.headWord}
      </div>
      <motion.div
        initial={{ y: 10 }}
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        className="text-[10rem] leading-none md:text-[14rem]"
        aria-hidden
      >
        {scenario.emoji}
      </motion.div>
      <p className="text-center text-4xl font-semibold text-slate-800 md:text-5xl">
        {scenario.caption}
      </p>
      <p className="text-center text-2xl text-slate-500">{scenario.cn}</p>
      <button
        type="button"
        onClick={() => speak(word.headWord)}
        className="min-h-16 rounded-2xl bg-indigo-500 px-8 py-4 text-xl font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-600 active:scale-95"
        aria-label="Play word"
      >
        🔊 听一听
      </button>
    </motion.div>
  );
}
