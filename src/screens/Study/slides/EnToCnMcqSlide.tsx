// src/screens/Study/slides/EnToCnMcqSlide.tsx
//
// Tier 2 recognition — English prompt, pick the matching Chinese meaning.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

import type { Scenario, Word } from "../../../types";
import { speak } from "./slideShared";
import McqOptionGrid, { OptionStatus } from "./McqOptionGrid";
import FeedbackBanner from "./FeedbackBanner";

interface Props {
  scenario: Extract<Scenario, { kind: "en_to_cn_mcq" }>;
  word: Word;
  onSubmit: (correct: boolean, latencyMs: number) => void;
  disabled?: boolean;
}

export default function EnToCnMcqSlide({ scenario, word, onSubmit, disabled }: Props) {
  const startedAtRef = useRef<number>(Date.now());
  const [picked, setPicked] = useState<number | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    startedAtRef.current = Date.now();
    speak(scenario.prompt);
  }, [scenario.prompt]);

  const answerIndex = useMemo(
    () => scenario.options.findIndex((o) => o === scenario.answer),
    [scenario.options, scenario.answer],
  );

  const statuses: OptionStatus[] = useMemo(() => {
    return scenario.options.map((_, idx) => {
      if (picked === null) return "idle";
      if (idx === picked) {
        return idx === answerIndex ? "selected-correct" : "selected-wrong";
      }
      if (resolved && idx === answerIndex) return "selected-correct";
      return "dim";
    });
  }, [picked, answerIndex, resolved, scenario.options]);

  const handleSelect = (idx: number) => {
    if (picked !== null || disabled) return;
    const correct = idx === answerIndex;
    const latencyMs = Date.now() - startedAtRef.current;
    setPicked(idx);
    if (correct) {
      setTimeout(() => {
        setResolved(true);
        onSubmit(true, latencyMs);
      }, 900);
    } else {
      speak(word.headWord);
      setTimeout(() => {
        setResolved(true);
        onSubmit(false, latencyMs);
      }, 1200);
    }
  };

  const handleReset = () => {
    setPicked(null);
    setResolved(false);
    startedAtRef.current = Date.now();
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      className="flex h-full w-full flex-col items-center justify-center gap-6 p-6 md:p-10"
    >
      <div className="text-sm font-medium uppercase tracking-widest text-indigo-400">
        English → 中文
      </div>
      <div className="flex flex-col items-center gap-3">
        <p className="text-5xl font-bold text-slate-800 md:text-6xl">
          {scenario.prompt}
        </p>
        <button
          type="button"
          onClick={() => speak(scenario.prompt)}
          className="min-h-12 rounded-xl bg-slate-100 px-4 py-2 text-lg text-slate-600 transition hover:bg-slate-200"
          aria-label="Replay word"
        >
          🔊
        </button>
      </div>
      <McqOptionGrid
        options={scenario.options}
        status={statuses}
        onSelect={handleSelect}
        disabled={picked !== null || disabled}
      />
      {picked !== null && picked !== answerIndex && (
        <FeedbackBanner kind="wrong" correctAnswer={scenario.answer} onReset={handleReset} />
      )}
      {picked !== null && picked === answerIndex && <FeedbackBanner kind="correct" />}
    </motion.div>
  );
}
