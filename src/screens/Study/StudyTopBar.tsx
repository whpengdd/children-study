// src/screens/Study/StudyTopBar.tsx
//
// Slim top bar for StudyScreen / ReviewScreen. Left: back button. Center:
// path label. Right: 10-dot progress indicator. Kept deliberately shallow so
// the Study folder doesn't sprout a dozen layout files.

import { useNavigate } from "react-router-dom";

import type { LearningPath } from "../../types";
import ProgressDots from "./ProgressDots";

export interface StudyTopBarProps {
  path: LearningPath | null;
  scenarioIndex: number;
  /** Queue-level progress "3/15" shown subtly below the dots. */
  queueIndex: number;
  queueLength: number;
  /** Optional override for the back target. Defaults to navigate(-1). */
  onBack?: () => void;
  /** Optional right-edge slot (e.g. pause button). */
  rightSlot?: React.ReactNode;
  /** Optional label override; by default derives from `path`. */
  label?: string;
}

function labelForPath(path: LearningPath | null): string {
  if (!path) return "学习";
  if (path.kind === "pep") return `小学 ${path.grade} 年级`;
  return path.exam;
}

export default function StudyTopBar({
  path,
  scenarioIndex,
  queueIndex,
  queueLength,
  onBack,
  rightSlot,
  label,
}: StudyTopBarProps): JSX.Element {
  const navigate = useNavigate();
  const handleBack = onBack ?? (() => navigate(-1));
  const title = label ?? labelForPath(path);

  return (
    <header
      className="flex items-center justify-between gap-3 px-4 py-3"
      style={{
        background: "#ffffffcc",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid #e5e7eb",
      }}
    >
      <button
        type="button"
        onClick={handleBack}
        aria-label="Back"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg font-semibold text-slate-700 hover:bg-slate-200 active:scale-95"
      >
        ←
      </button>
      <div className="flex flex-1 flex-col items-center">
        <div className="text-sm font-semibold text-slate-600">{title}</div>
        <div className="mt-1 flex flex-col items-center gap-0.5">
          <ProgressDots count={10} current={scenarioIndex} />
          {queueLength > 0 && (
            <div className="text-[10px] font-medium text-slate-400">
              {Math.min(queueIndex + 1, queueLength)} / {queueLength}
            </div>
          )}
        </div>
      </div>
      <div className="min-w-10 flex items-center justify-end">
        {rightSlot}
      </div>
    </header>
  );
}
