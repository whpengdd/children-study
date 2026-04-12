// src/screens/Study/slides/McqOptionGrid.tsx
//
// Presentational 4-option grid used by every Tier 2/3 MCQ slide. Each option is
// a big rounded card with its own colour state (idle / correct / wrong /
// dimmed). The parent owns selection state & feedback timing — this only
// renders.

import { motion } from "framer-motion";

export type OptionStatus = "idle" | "selected-correct" | "selected-wrong" | "dim";

export interface McqOptionGridProps {
  options: string[];
  status: OptionStatus[]; // same length as options
  onSelect: (index: number) => void;
  disabled?: boolean;
  columns?: 2 | 4;
}

export default function McqOptionGrid({
  options,
  status,
  onSelect,
  disabled = false,
  columns = 2,
}: McqOptionGridProps) {
  const grid = columns === 2 ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4";
  return (
    <div className={`grid w-full max-w-2xl gap-4 ${grid}`}>
      {options.map((opt, idx) => {
        const s = status[idx] ?? "idle";
        const base =
          "min-h-16 rounded-2xl border-2 p-5 text-2xl font-semibold shadow-md transition-all select-none";
        const stateClass =
          s === "selected-correct"
            ? "border-emerald-500 bg-emerald-50 text-emerald-700 ring-4 ring-emerald-300"
            : s === "selected-wrong"
            ? "border-rose-500 bg-rose-50 text-rose-700 ring-4 ring-rose-300 animate-pulse"
            : s === "dim"
            ? "border-slate-200 bg-white text-slate-400 opacity-60"
            : "border-slate-200 bg-white text-slate-800 hover:border-indigo-400 hover:bg-indigo-50 active:scale-95";
        return (
          <motion.button
            key={`${opt}-${idx}`}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(idx)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.06 }}
            className={`${base} ${stateClass}`}
          >
            {opt}
          </motion.button>
        );
      })}
    </div>
  );
}
