// src/screens/Study/slides/DialogSlide.tsx
//
// Tier 1 passive exposure — play a short A/B dialog, highlighting the target
// word wherever it appears. Each turn waits for its TTS to finish before the
// next reveals (no more racing setTimeouts), then `onExposureDone` is called
// after a final cushion so the carousel doesn't cut the dialog mid-line.

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

import type { Scenario, Word } from "../../../types";
import { delay, speakAndWait } from "./slideShared";

interface Props {
  scenario: Extract<Scenario, { kind: "dialog" }>;
  word: Word;
  onExposureDone: () => void;
  disabled?: boolean;
}

/** Pause between consecutive turns to give a natural conversational beat. */
const INTER_TURN_MS = 400;
/** Cushion after the final turn finishes before we hand off to the carousel. */
const FINAL_PAUSE_MS = 1000;

function highlight(line: string, target: string): (string | JSX.Element)[] {
  if (!target) return [line];
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

export default function DialogSlide({ scenario, word, onExposureDone }: Props) {
  const [revealedUpTo, setRevealedUpTo] = useState(0);
  const [replayToken, setReplayToken] = useState(0);

  const doneRef = useRef(onExposureDone);
  useEffect(() => {
    doneRef.current = onExposureDone;
  }, [onExposureDone]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRevealedUpTo(0);
      for (let i = 0; i < scenario.turns.length; i++) {
        if (cancelled) return;
        const turn = scenario.turns[i];
        setRevealedUpTo(i + 1);
        await speakAndWait(turn.text);
        if (cancelled) return;
        if (i < scenario.turns.length - 1) {
          await delay(INTER_TURN_MS);
        }
      }
      if (cancelled) return;
      await delay(FINAL_PAUSE_MS);
      if (cancelled) return;
      // Only the initial mount should trigger advance — replays are user-initiated
      // and the carousel watchdog handles those.
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
        onClick={handleReplay}
        className="mt-2 min-h-12 rounded-2xl bg-indigo-500 px-6 py-3 text-lg font-semibold text-white shadow-md transition hover:bg-indigo-600 active:scale-95"
      >
        🔁 再听一遍
      </button>
    </motion.div>
  );
}
