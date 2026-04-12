// src/components/XpGainToast.tsx
//
// Floats a "+N XP" label upward and fades out. Auto-unmounts after the
// animation via onAnimationComplete. Cheap, no timers needed.

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

export interface XpGainToastProps {
  xp: number;
  /** Called when the toast finishes animating. */
  onDone?: () => void;
  /** Override duration (ms); defaults to 1200ms. */
  durationMs?: number;
}

export function XpGainToast({
  xp,
  onDone,
  durationMs = 1200,
}: XpGainToastProps): JSX.Element | null {
  const [alive, setAlive] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setAlive(false);
      onDone?.();
    }, durationMs);
    return () => window.clearTimeout(t);
  }, [xp, durationMs, onDone]);

  if (xp <= 0) return null;

  return (
    <AnimatePresence>
      {alive && (
        <motion.div
          key={`xp-${xp}-${durationMs}`}
          initial={{ opacity: 0, y: 6, scale: 0.9 }}
          animate={{ opacity: 1, y: -24, scale: 1.05 }}
          exit={{ opacity: 0, y: -32, scale: 1 }}
          transition={{ duration: durationMs / 1000, ease: "easeOut" }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "4px 10px",
            borderRadius: 9999,
            fontSize: 13,
            fontWeight: 700,
            color: "#854d0e", // tailwind yellow-800
            background: "#fef9c3", // yellow-100
            boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
            pointerEvents: "none",
          }}
          role="status"
          aria-live="polite"
        >
          +{xp} XP
        </motion.div>
      )}
    </AnimatePresence>
  );
}
