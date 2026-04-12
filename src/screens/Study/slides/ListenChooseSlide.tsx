// src/screens/Study/slides/ListenChooseSlide.tsx
//
// Tier 2 recognition — child hears the target word and taps the matching card.
// Tests the audio→orthography link without asking for production.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

import type { Scenario, Word } from "../../../types";
import { speak } from "./slideShared";
import McqOptionGrid, { OptionStatus } from "./McqOptionGrid";
import FeedbackBanner from "./FeedbackBanner";

interface Props {
  scenario: Extract<Scenario, { kind: "listen_choose" }>;
  word: Word;
  onSubmit: (correct: boolean, latencyMs: number) => void;
  disabled?: boolean;
}

export default function ListenChooseSlide({
  scenario,
  word,
  onSubmit,
  disabled,
}: Props) {
  const startedAtRef = useRef<number>(Date.now());
  const [picked, setPicked] = useState<number | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    startedAtRef.current = Date.now();
    // autoplay once on mount so the learner immediately hears what to pick
    speak(scenario.audioWord);
  }, [scenario.audioWord]);

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
      // wrong: reveal correct answer + speak it, let parent decide next step
      speak(scenario.audioWord);
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
        Listen &amp; choose · {word.headWord}
      </div>
      <button
        type="button"
        onClick={() => speak(scenario.audioWord)}
        className="flex min-h-24 w-40 items-center justify-center rounded-full bg-indigo-500 text-6xl text-white shadow-xl shadow-indigo-200 transition hover:bg-indigo-600 active:scale-95"
        aria-label="Play word"
      >
        🔊
      </button>
      <p className="text-center text-lg text-slate-500">
        点击播放，然后选择你听到的单词
      </p>
      <McqOptionGrid
        options={scenario.options}
        status={statuses}
        onSelect={handleSelect}
        disabled={picked !== null || disabled}
      />
      {picked !== null && picked !== answerIndex && (
        <FeedbackBanner
          kind="wrong"
          correctAnswer={scenario.answer}
          onReset={handleReset}
        />
      )}
      {picked !== null && picked === answerIndex && <FeedbackBanner kind="correct" />}
    </motion.div>
  );
}
