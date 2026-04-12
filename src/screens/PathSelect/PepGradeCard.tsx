// src/screens/PathSelect/PepGradeCard.tsx
//
// Large tile that represents a PEP grade. Displays the grade number, total
// word count for that grade, and a little progress bar of "graduated /
// total" words for the current profile.

import type { PepGrade } from "../../types";

export interface PepGradeCardProps {
  grade: PepGrade;
  totalWords: number;
  graduatedCount: number;
  onSelect: (grade: PepGrade) => void;
}

// Per-grade palette keeps each card visually distinct.
const GRADE_THEMES: Record<PepGrade, { bg: string; accent: string; emoji: string }> = {
  3: {
    bg: "bg-gradient-to-br from-emerald-100 to-emerald-200",
    accent: "bg-emerald-500",
    emoji: "🌱",
  },
  4: {
    bg: "bg-gradient-to-br from-sky-100 to-sky-200",
    accent: "bg-sky-500",
    emoji: "🌊",
  },
  5: {
    bg: "bg-gradient-to-br from-amber-100 to-amber-200",
    accent: "bg-amber-500",
    emoji: "⭐",
  },
  6: {
    bg: "bg-gradient-to-br from-rose-100 to-rose-200",
    accent: "bg-rose-500",
    emoji: "🚀",
  },
};

export function PepGradeCard({
  grade,
  totalWords,
  graduatedCount,
  onSelect,
}: PepGradeCardProps) {
  const theme = GRADE_THEMES[grade];
  const pct = totalWords > 0 ? Math.min(100, Math.round((graduatedCount / totalWords) * 100)) : 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(grade)}
      className={`flex flex-col items-start gap-3 rounded-3xl ${theme.bg} border border-white p-5 text-left shadow-md transition hover:shadow-xl hover:-translate-y-1 active:translate-y-0 active:shadow-sm`}
      aria-label={`选择 PEP 三至六年级 ${grade}`}
    >
      <div className="flex w-full items-center justify-between">
        <div className="text-5xl font-bold text-gray-900">
          PEP{grade}
        </div>
        <div className="text-3xl leading-none">{theme.emoji}</div>
      </div>
      <div className="text-sm text-gray-700">{totalWords} 个单词</div>
      <div className="w-full">
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/70">
          <div
            className={`h-full ${theme.accent} transition-all`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 text-xs text-gray-600">
          已掌握 {graduatedCount} / {totalWords}
        </div>
      </div>
    </button>
  );
}

export default PepGradeCard;
