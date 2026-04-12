// src/screens/Study/slides/CnToEnMcqSlide.tsx
//
// Tier 3 production (recall + select) — Chinese prompt, pick the matching
// English word. No audio cue; learner must produce the form from meaning.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

import type { Scenario, Word } from "../../../types";
import { speak } from "./slideShared";
import McqOptionGrid, { OptionStatus } from "./McqOptionGrid";
import FeedbackBanner from "./FeedbackBanner";

interface Props {
  scenario: Extract<Scenario, { kind: "cn_to_en_mcq" }>;
  word: Word;
  onSubmit: (correct: boolean, latencyMs: number) => void;
  disabled?: boolean;
}

export default function CnToEnMcqSlide({ scenario, word, onSubmit, disabled }: Props) {
  const startedAtRef = useRef<number>(Date.now());
  const [picked, setPicked] = useState<number | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    startedAtRef.current = Date.now();
  }, [scenario.promptCn]);

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
      speak(scenario.options[idx]);
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
        中文 → English
      </div>
      <p className="text-5xl font-bold text-slate-800 md:text-6xl">
        {scenario.promptCn}
      </p>
      <p className="text-lg text-slate-500">选出对应的英文单词</p>
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
