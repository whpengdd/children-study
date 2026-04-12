// src/components/ProgressDots.tsx
//
// 10-dot tier indicator for the StudyScreen top bar. Colors reflect the
// tier of each scenario position:
//   - index 0..2 → Tier 1 (indigo)
//   - index 3..4 → Tier 2 (cyan)
//   - index 5..7 → Tier 3 (amber)
//   - index 8..9 → Tier 4 (gold)
// The current position pulses and is filled; past positions are filled but
// static; future positions are outlined.

import { motion } from "framer-motion";

export interface ProgressDotsProps {
  /** How many dots total (almost always 10). */
  count?: number;
  /** Index of the current scenario (0-based). Can be > count-1 when exhausted. */
  current: number;
}

function tierColorOfIndex(i: number): string {
  if (i < 3) return "#6366f1";  // indigo-500
  if (i < 5) return "#06b6d4";  // cyan-500
  if (i < 8) return "#f59e0b";  // amber-500
  return "#eab308";              // yellow-500 (gold-ish)
}

export default function ProgressDots({
  count = 10,
  current,
}: ProgressDotsProps): JSX.Element {
  const items = Array.from({ length: count }, (_, i) => i);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={count}
      aria-valuenow={Math.max(0, Math.min(current, count))}
      className="flex items-center gap-1.5"
    >
      {items.map((i) => {
        const color = tierColorOfIndex(i);
        const isPast = i < current;
        const isCurrent = i === current;
        const baseStyle: React.CSSProperties = {
          width: 12,
          height: 12,
          borderRadius: 9999,
          border: `2px solid ${color}`,
          background: isPast || isCurrent ? color : "transparent",
        };
        if (isCurrent) {
          return (
            <motion.span
              key={i}
              aria-hidden
              style={baseStyle}
              animate={{ scale: [1, 1.35, 1], opacity: [1, 0.8, 1] }}
              transition={{
                duration: 1.1,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          );
        }
        return <span key={i} aria-hidden style={baseStyle} />;
      })}
    </div>
  );
}
