// src/screens/PathSelect/ExamCard.tsx
//
// Exam tile for the "按考试" section of PathSelect. KET / PET have identical
// mechanics — just different totals and theme colors.

import type { Exam } from "../../types";

export interface ExamCardProps {
  exam: Exam;
  totalWords: number;
  graduatedCount: number;
  onSelect: (exam: Exam) => void;
}

const EXAM_THEMES: Record<Exam, { bg: string; accent: string; subtitle: string; emoji: string }> = {
  KET: {
    bg: "bg-gradient-to-br from-indigo-100 to-indigo-200",
    accent: "bg-indigo-600",
    subtitle: "剑桥 A2 · 入门级",
    emoji: "🎯",
  },
  PET: {
    bg: "bg-gradient-to-br from-fuchsia-100 to-fuchsia-200",
    accent: "bg-fuchsia-600",
    subtitle: "剑桥 B1 · 初级",
    emoji: "🏆",
  },
};

export function ExamCard({
  exam,
  totalWords,
  graduatedCount,
  onSelect,
}: ExamCardProps) {
  const theme = EXAM_THEMES[exam];
  const pct = totalWords > 0 ? Math.min(100, Math.round((graduatedCount / totalWords) * 100)) : 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(exam)}
      className={`flex flex-col items-start gap-3 rounded-3xl ${theme.bg} border border-white p-6 text-left shadow-md transition hover:shadow-xl hover:-translate-y-1 active:translate-y-0 active:shadow-sm`}
      aria-label={`选择 ${exam} 考试路径`}
    >
      <div className="flex w-full items-center justify-between">
        <div>
          <div className="text-5xl font-bold text-gray-900">{exam}</div>
          <div className="mt-1 text-sm text-gray-600">{theme.subtitle}</div>
        </div>
        <div className="text-4xl leading-none">{theme.emoji}</div>
      </div>
      <div className="text-sm text-gray-700">{totalWords.toLocaleString()} 个单词</div>
      <div className="w-full">
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/70">
          <div
            className={`h-full ${theme.accent} transition-all`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 text-xs text-gray-600">
          已掌握 {graduatedCount.toLocaleString()} / {totalWords.toLocaleString()}
        </div>
      </div>
    </button>
  );
}

export default ExamCard;
