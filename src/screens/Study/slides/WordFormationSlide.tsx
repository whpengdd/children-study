// src/screens/Study/slides/WordFormationSlide.tsx
//
// Tier 3 production — given a root word + morphological prompt ("plural" /
// "past tense"), pick the correctly-formed word.
//
// NOTE: the `word_formation` scenario shape in `src/types/vocab.ts` only has
// `{ root, prompt, answer }` — NO `options[]`. The plan calls for a 4-option
// MCQ, so this slide synthesises three naive distractors from the root (-s,
// -ed, -ing, -er, raw root) and shuffles them with the real answer. Agent-
// Pipeline / Wave 0 should consider extending the type with explicit options.

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

import type { Scenario, Word } from "../../../types";
import { speak } from "./slideShared";
import McqOptionGrid, { OptionStatus } from "./McqOptionGrid";
import FeedbackBanner from "./FeedbackBanner";

interface Props {
  scenario: Extract<Scenario, { kind: "word_formation" }>;
  word: Word;
  onSubmit: (correct: boolean, latencyMs: number) => void;
  disabled?: boolean;
}

/**
 * Deterministically build 4 options containing the answer plus synthetic
 * distractors derived from the root. Deterministic so React re-renders don't
 * reshuffle and the options stay stable for a given scenario.
 */
function buildOptions(root: string, answer: string): string[] {
  const pool = new Set<string>();
  pool.add(answer);
  pool.add(root);
  pool.add(`${root}s`);
  pool.add(`${root}ed`);
  pool.add(`${root}ing`);
  pool.add(`${root}er`);
  // Remove the answer so we can place it at a deterministic index.
  pool.delete(answer);
  const distractors = Array.from(pool).slice(0, 3);
  const all = [...distractors, answer];
  // Deterministic shuffle using a cheap hash of (root+answer) as seed.
  const seed = (root + answer).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  for (let i = all.length - 1; i > 0; i -= 1) {
    const j = (seed + i * 31) % (i + 1);
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

export default function WordFormationSlide({ scenario, word, onSubmit, disabled }: Props) {
  const startedAtRef = useRef<number>(Date.now());
  const [picked, setPicked] = useState<number | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    startedAtRef.current = Date.now();
  }, [scenario.root, scenario.answer]);

  const options = useMemo(
    () => buildOptions(scenario.root, scenario.answer),
    [scenario.root, scenario.answer],
  );

  const answerIndex = useMemo(
    () => options.findIndex((o) => o === scenario.answer),
    [options, scenario.answer],
  );

  const statuses: OptionStatus[] = useMemo(() => {
    return options.map((_, idx) => {
      if (picked === null) return "idle";
      if (idx === picked) {
        return idx === answerIndex ? "selected-correct" : "selected-wrong";
      }
      if (resolved && idx === answerIndex) return "selected-correct";
      return "dim";
    });
  }, [picked, answerIndex, resolved, options]);

  const handleSelect = (idx: number) => {
    if (picked !== null || disabled) return;
    const correct = idx === answerIndex;
    const latencyMs = Date.now() - startedAtRef.current;
    setPicked(idx);
    if (correct) {
      speak(scenario.answer);
      setTimeout(() => {
        setResolved(true);
        onSubmit(true, latencyMs);
      }, 900);
    } else {
      speak(scenario.answer);
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
        Word formation · {word.headWord}
      </div>
      <div className="flex flex-col items-center gap-2">
        <p className="text-6xl font-bold text-slate-800">{scenario.root}</p>
        <p className="text-xl font-medium text-slate-600">{scenario.prompt}</p>
      </div>
      <McqOptionGrid
        options={options}
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
