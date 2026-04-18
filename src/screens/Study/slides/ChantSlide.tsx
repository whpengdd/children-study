// src/screens/Study/slides/ChantSlide.tsx
//
// Tier 1 passive exposure — rhythmic chant. Each line reveals only after the
// previous line's TTS has finished, then `onExposureDone` fires after a final
// cushion so the carousel doesn't preempt the chant.

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

import type { Scenario, Word } from "../../../types";
import { delay, speakAndWait } from "./slideShared";

interface Props {
  scenario: Extract<Scenario, { kind: "chant" }>;
  word: Word;
  onExposureDone: () => void;
  disabled?: boolean;
}

/** Pause between consecutive lines. */
const INTER_LINE_MS = 250;
/** Cushion after the final line finishes before we hand off to the carousel. */
const FINAL_PAUSE_MS = 800;

export default function ChantSlide({ scenario, word, onExposureDone }: Props) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [replayToken, setReplayToken] = useState(0);

  const doneRef = useRef(onExposureDone);
  useEffect(() => {
    doneRef.current = onExposureDone;
  }, [onExposureDone]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setVisibleCount(0);
      for (let i = 0; i < scenario.lines.length; i++) {
        if (cancelled) return;
        setVisibleCount(i + 1);
        await speakAndWait(scenario.lines[i]);
        if (cancelled) return;
        if (i < scenario.lines.length - 1) {
          await delay(INTER_LINE_MS);
        }
      }
      if (cancelled) return;
      await delay(FINAL_PAUSE_MS);
      if (cancelled) return;
      if (replayToken === 0) doneRef.current();
    })();
    return () => {
      cancelled = true;
    };
  }, [scenario, replayToken]);

  const handleReplay = () => {
    setReplayToken((t) => t + 1);
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
