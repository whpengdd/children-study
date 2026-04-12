// src/screens/Study/slides/ChantSlide.tsx
//
// Tier 1 passive exposure — rhythmic chant. Each line fades in with a 400ms
// stagger and is read aloud. Advance is owned by StudyScreen's useAutoCarousel.

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import type { Scenario, Word } from "../../../types";
import { speak } from "./slideShared";

interface Props {
  scenario: Extract<Scenario, { kind: "chant" }>;
  word: Word;
  onExposureDone: () => void;
  disabled?: boolean;
}

export default function ChantSlide({ scenario, word }: Props) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let i = 0;
    const step = () => {
      if (cancelled || i >= scenario.lines.length) return;
      setVisibleCount(i + 1);
      speak(scenario.lines[i]);
      i += 1;
      setTimeout(step, 900);
    };
    step();
    return () => {
      cancelled = true;
    };
  }, [scenario]);

  const handleReplay = () => {
    setVisibleCount(0);
    let i = 0;
    const tick = () => {
      if (i >= scenario.lines.length) return;
      setVisibleCount(i + 1);
      speak(scenario.lines[i]);
      i += 1;
      setTimeout(tick, 900);
    };
    tick();
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      className="flex h-full w-full flex-col items-center justify-center gap-4 p-8"
    >
      <div className="text-sm font-medium uppercase tracking-widest text-indigo-400">
        Chant · {word.headWord}
      </div>
      <ul className="flex flex-col items-center gap-3">
        {scenario.lines.map((line, idx) => (
          <motion.li
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{
              opacity: idx < visibleCount ? 1 : 0,
              y: idx < visibleCount ? 0 : 20,
            }}
            transition={{ duration: 0.4, delay: idx * 0.1 }}
            className="text-3xl font-bold text-slate-800 md:text-4xl"
          >
            {line}
          </motion.li>
        ))}
      </ul>
      <p className="mt-2 text-center text-lg text-slate-500">{scenario.cn}</p>
      <button
        type="button"
        onClick={handleReplay}
        className="mt-4 min-h-16 rounded-2xl bg-indigo-500 px-8 py-4 text-xl font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-600 active:scale-95"
      >
        🔁 再来一次
      </button>
    </motion.div>
  );
}
