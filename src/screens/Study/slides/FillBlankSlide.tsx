// src/screens/Study/slides/FillBlankSlide.tsx
//
// Tier 3 production — sentence with a blank, pick the word that completes it.
// Once a choice is locked in, the blank animates into the chosen word so the
// learner sees the full sentence as context.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

import type { Scenario, Word } from "../../../types";
import { speak } from "./slideShared";
import McqOptionGrid, { OptionStatus } from "./McqOptionGrid";
import FeedbackBanner from "./FeedbackBanner";

interface Props {
  scenario: Extract<Scenario, { kind: "fill_blank_choose" }>;
  word: Word;
  onSubmit: (correct: boolean, latencyMs: number) => void;
  disabled?: boolean;
}

function renderSentence(raw: string, filled: string | null): (string | JSX.Element)[] {
  const parts = raw.split(/(_{2,})/);
  return parts.map((part, idx) => {
    if (/_{2,}/.test(part)) {
      return (
        <span
          key={idx}
          className={`mx-2 inline-block min-w-[5rem] rounded-lg px-3 py-1 text-center align-baseline ${
            filled
              ? "bg-emerald-100 text-emerald-700"
              : "border-b-4 border-slate-400 text-transparent"
          }`}
        >
          {filled ?? "____"}
        </span>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

export default function FillBlankSlide({ scenario, word, onSubmit, disabled }: Props) {
  const startedAtRef = useRef<number>(Date.now());
  const [picked, setPicked] = useState<number | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    startedAtRef.current = Date.now();
  }, [scenario.sentenceWithBlank]);

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

  const filledWord = picked !== null ? scenario.options[picked] : null;
  const sentenceDisplay = renderSentence(scenario.sentenceWithBlank, filledWord);

  const handleSelect = (idx: number) => {
    if (picked !== null || disabled) return;
    const correct = idx === answerIndex;
    const latencyMs = Date.now() - startedAtRef.current;
    setPicked(idx);
    if (correct) {
      // speak the full sentence once filled in, replacing the blank with the answer
      const spoken = scenario.sentenceWithBlank.replace(/_{2,}/, scenario.answer);
      speak(spoken);
      setTimeout(() => {
        setResolved(true);
        onSubmit(true, latencyMs);
      }, 1200);
    } else {
      speak(word.headWord);
      setTimeout(() => {
        setResolved(true);
        onSubmit(false, latencyMs);
      }, 1400);
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
        Fill in the blank
      </div>
      <p className="max-w-3xl text-center text-3xl font-semibold leading-snug text-slate-800 md:text-4xl">
        {sentenceDisplay}
      </p>
      <p className="max-w-xl text-center text-lg text-slate-500">{scenario.cn}</p>
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
