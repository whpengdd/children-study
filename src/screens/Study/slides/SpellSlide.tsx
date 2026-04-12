// src/screens/Study/slides/SpellSlide.tsx
//
// Tier 4 mastery — free text input, handles BOTH `spell_from_audio` and
// `spell_from_cn` by tagging off `scenario.kind`. The learner must type the
// exact answer (case-insensitive, trimmed, punctuation stripped).

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { motion } from "framer-motion";

import type { Scenario, Word } from "../../../types";
import { normalizeAnswer, speak } from "./slideShared";
import FeedbackBanner from "./FeedbackBanner";

type SpellScenario = Extract<
  Scenario,
  { kind: "spell_from_audio" } | { kind: "spell_from_cn" }
>;

interface Props {
  scenario: SpellScenario;
  word: Word;
  onSubmit: (correct: boolean, latencyMs: number) => void;
  disabled?: boolean;
}

export default function SpellSlide({ scenario, word, onSubmit, disabled }: Props) {
  const startedAtRef = useRef<number>(Date.now());
  const inputRef = useRef<HTMLInputElement | null>(null);
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [value, setValue] = useState("");
  const [result, setResult] = useState<"idle" | "correct" | "wrong">("idle");

  useEffect(() => {
    startedAtRef.current = Date.now();
    setValue("");
    setResult("idle");
    inputRef.current?.focus();
    if (scenario.kind === "spell_from_audio") {
      speak(scenario.audioWord);
    }
    return () => {
      if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
    };
  }, [scenario]);

  const expected = useMemo(() => normalizeAnswer(scenario.answer), [scenario.answer]);

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    if (result !== "idle" || disabled) return;
    const latencyMs = Date.now() - startedAtRef.current;
    const given = normalizeAnswer(value);
    if (given === "") return;
    const correct = given === expected;
    setResult(correct ? "correct" : "wrong");
    speak(scenario.answer);
    if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
    submitTimerRef.current = setTimeout(
      () => onSubmit(correct, latencyMs),
      correct ? 1000 : 1400,
    );
  };

  const handleReset = () => {
    if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
    submitTimerRef.current = null;
    setValue("");
    setResult("idle");
    startedAtRef.current = Date.now();
    inputRef.current?.focus();
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      className="flex h-full w-full flex-col items-center justify-center gap-6 p-6 md:p-10"
    >
      <div className="text-sm font-medium uppercase tracking-widest text-indigo-400">
        Spell it · {word.headWord}
      </div>
      {scenario.kind === "spell_from_audio" ? (
        <div className="flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={() => speak(scenario.audioWord)}
            className="flex min-h-24 w-40 items-center justify-center rounded-full bg-indigo-500 text-6xl text-white shadow-xl shadow-indigo-200 transition hover:bg-indigo-600 active:scale-95"
            aria-label="Play word"
          >
            🔊
          </button>
          <p className="text-center text-lg text-slate-500">听音拼写</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <p className="text-5xl font-bold text-slate-800 md:text-6xl">
            {scenario.promptCn}
          </p>
          <p className="text-center text-lg text-slate-500">写出对应的英文</p>
        </div>
      )}
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-xl flex-col items-center gap-4"
      >
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={result !== "idle" || disabled}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          placeholder="Type here..."
          className={`w-full rounded-2xl border-2 bg-white p-5 text-center text-3xl font-semibold shadow-md outline-none transition ${
            result === "correct"
              ? "border-emerald-500 text-emerald-700 ring-4 ring-emerald-300"
              : result === "wrong"
              ? "border-rose-500 text-rose-700 ring-4 ring-rose-300"
              : "border-slate-200 text-slate-800 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-200"
          }`}
        />
        <button
          type="submit"
          disabled={result !== "idle" || disabled || value.trim().length === 0}
          className="min-h-16 rounded-2xl bg-indigo-500 px-10 py-4 text-xl font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-600 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
        >
          提交 · Submit
        </button>
      </form>
      {result === "correct" && <FeedbackBanner kind="correct" />}
      {result === "wrong" && (
        <FeedbackBanner
          kind="wrong"
          correctAnswer={scenario.answer}
          onReset={handleReset}
        />
      )}
    </motion.div>
  );
}
