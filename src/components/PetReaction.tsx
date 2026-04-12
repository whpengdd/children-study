// src/components/PetReaction.tsx
//
// Small speech bubble that appears when the pet reacts to a correct/wrong
// answer or a celebration milestone. Auto-dismisses after ~1.5s.

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

export type PetReactionKind = "correct" | "wrong" | "celebrate";

export interface PetReactionProps {
  reaction: PetReactionKind;
  /** Called once the reaction has self-dismissed. */
  onDismiss?: () => void;
  /** Override dismiss timer; defaults to 1500ms. */
  durationMs?: number;
}

interface ReactionContent {
  emoji: string;
  text: string;
  bg: string;
  color: string;
}

const CONTENT: Record<PetReactionKind, ReactionContent> = {
  correct: {
    emoji: "✨",
    text: "太棒了!",
    bg: "#dcfce7", // tailwind green-100
    color: "#166534", // tailwind green-800
  },
  wrong: {
    emoji: "🤔",
    text: "再试试",
    bg: "#fef3c7", // amber-100
    color: "#92400e", // amber-800
  },
  celebrate: {
    emoji: "🎉",
    text: "升阶啦!",
    bg: "#fce7f3", // pink-100
    color: "#9d174d", // pink-800
  },
};

export function PetReaction({
  reaction,
  onDismiss,
  durationMs = 1500,
}: PetReactionProps): JSX.Element {
  useEffect(() => {
    const t = window.setTimeout(() => onDismiss?.(), durationMs);
    return () => window.clearTimeout(t);
  }, [reaction, onDismiss, durationMs]);

  const { emoji, text, bg, color } = CONTENT[reaction];

  return (
    <AnimatePresence>
      <motion.div
        key={reaction}
        initial={{ opacity: 0, y: 8, scale: 0.85 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.85 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        role="status"
        aria-live="polite"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "6px 12px",
          borderRadius: 9999,
          fontSize: 14,
          fontWeight: 600,
          background: bg,
          color,
          boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
          whiteSpace: "nowrap",
        }}
      >
        <span aria-hidden>{emoji}</span>
        <span>{text}</span>
      </motion.div>
    </AnimatePresence>
  );
}
