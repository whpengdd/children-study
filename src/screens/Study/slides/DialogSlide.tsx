// src/screens/Study/slides/DialogSlide.tsx
//
// Tier 1 passive exposure — play a short A/B dialog, highlighting the target
// word wherever it appears. Each turn fades in with a stagger, then TTS reads
// each line in sequence. Advance is owned by StudyScreen's useAutoCarousel.

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import type { Scenario, Word } from "../../../types";
import { speak } from "./slideShared";

interface Props {
  scenario: Extract<Scenario, { kind: "dialog" }>;
  word: Word;
  onExposureDone: () => void;
  disabled?: boolean;
}

function highlight(line: string, target: string): (string | JSX.Element)[] {
  if (!target) return [line];
  // Match word-ish boundaries, case-insensitive, keep the original casing.
  const regex = new RegExp(`\\b(${target.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")})\\b`, "gi");
  const parts = line.split(regex);
  return parts.map((part, idx) =>
    regex.test(part) ? (
      <mark
        key={idx}
        className="rounded bg-amber-200 px-1 text-slate-900"
      >
        {part}
      </mark>
    ) : (
      <span key={idx}>{part}</span>
    ),
  );
}

export default function DialogSlide({ scenario, word }: Props) {
  const [revealedUpTo, setRevealedUpTo] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let turnIndex = 0;

    const playNext = () => {
      if (cancelled || turnIndex >= scenario.turns.length) return;
      const turn = scenario.turns[turnIndex];
      setRevealedUpTo(turnIndex + 1);
      speak(turn.text);
      turnIndex += 1;
      setTimeout(playNext, 1600);
    };

    playNext();
    return () => {
      cancelled = true;
    };
  }, [scenario]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 md:p-10"
    >
      <div className="text-sm font-medium uppercase tracking-widest text-indigo-400">
        Dialog · {word.headWord}
      </div>
      <div className="flex w-full max-w-2xl flex-col gap-4">
        {scenario.turns.map((turn, idx) => {
          const isA = turn.speaker === "A";
          const shown = idx < revealedUpTo;
          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: shown ? 1 : 0.15, y: shown ? 0 : 12 }}
              transition={{ duration: 0.35 }}
              className={`flex w-full ${isA ? "justify-start" : "justify-end"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-5 py-4 shadow-md ${
                  isA
                    ? "bg-white text-slate-800"
                    : "bg-indigo-500 text-white"
                }`}
              >
                <div className="text-xs font-semibold uppercase opacity-70">
                  {turn.speaker}
                </div>
                <div className="mt-1 text-2xl font-semibold leading-snug">
                  {highlight(turn.text, word.headWord)}
                </div>
                <div
                  className={`mt-1 text-base ${
                    isA ? "text-slate-500" : "text-indigo-100"
                  }`}
                >
                  {turn.cn}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => {
          setRevealedUpTo(0);
          let i = 0;
          const tick = () => {
            if (i >= scenario.turns.length) return;
            setRevealedUpTo(i + 1);
            speak(scenario.turns[i].text);
            i += 1;
            setTimeout(tick, 1600);
          };
          tick();
        }}
        className="mt-2 min-h-12 rounded-2xl bg-indigo-500 px-6 py-3 text-lg font-semibold text-white shadow-md transition hover:bg-indigo-600 active:scale-95"
      >
        🔁 再听一遍
      </button>
    </motion.div>
  );
}
