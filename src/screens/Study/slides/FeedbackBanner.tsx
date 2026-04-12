// src/screens/Study/slides/FeedbackBanner.tsx
//
// Shared correct/wrong banner used by every Tier 2-4 slide. Keeps the visual
// language consistent: emerald for correct, rose for wrong, big emoji + short
// Chinese copy.

import { motion } from "framer-motion";

export type FeedbackKind = "correct" | "wrong";

interface Props {
  kind: FeedbackKind;
  correctAnswer?: string;
  onReset?: () => void;
}

export default function FeedbackBanner({ kind, correctAnswer, onReset }: Props) {
  if (kind === "correct") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 rounded-2xl bg-emerald-500 px-6 py-3 text-xl font-semibold text-white shadow-lg"
      >
        <span aria-hidden>✅</span>
        <span>太棒了！</span>
      </motion.div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center gap-3 rounded-2xl bg-rose-50 px-6 py-4 text-rose-700 shadow-lg"
    >
      <div className="flex items-center gap-2 text-xl font-semibold">
        <span aria-hidden>❌</span>
        <span>再来一次</span>
      </div>
      {correctAnswer && (
        <div className="text-base">
          正确答案：<span className="font-bold">{correctAnswer}</span>
        </div>
      )}
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="mt-1 min-h-12 rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-600 active:scale-95"
        >
          重试
        </button>
      )}
    </motion.div>
  );
}
