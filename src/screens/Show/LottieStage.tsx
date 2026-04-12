// src/screens/Show/LottieStage.tsx
//
// Reusable animation container for the pet show layer.
//
// Two paths:
//   1. If `animationData` is provided -> render lottie-react's <Lottie />.
//   2. Otherwise render a Framer Motion bounce of `fallbackEmoji` (or a default
//      sparkle). The fallback path is what Wave 2 ships; Wave 3 will start
//      passing real Lottie JSON in.
//
// Kept intentionally thin — it's the shared "big shiny thing" that PetHome,
// HatchCeremony and ShowPlayer all reuse.
//
// Props:
//   animationData : Lottie JSON object (optional)
//   fallbackEmoji : emoji string rendered when no Lottie is available
//   size          : pixel size (both width and height)
//   playing       : whether the animation is currently active (pauses the
//                   motion animation when false)

import Lottie from "lottie-react";
import { motion } from "framer-motion";

export interface LottieStageProps {
  /** Lottie animation JSON. When provided, takes priority over the emoji. */
  animationData?: unknown;
  /** Emoji rendered when no Lottie JSON is supplied. */
  fallbackEmoji?: string;
  /** Pixel size of the stage (rendered square). */
  size: number;
  /** When false, freezes the animation. Defaults to true. */
  playing?: boolean;
  /** Optional class for outer wrapper styling. */
  className?: string;
}

export function LottieStage({
  animationData,
  fallbackEmoji = "✨",
  size,
  playing = true,
  className,
}: LottieStageProps): JSX.Element {
  // Lottie path: render the supplied animation.
  if (animationData) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* `lottie-react` accepts an animationData object plus play/pause via `isPaused`. */}
        <Lottie
          animationData={animationData}
          loop
          autoplay={playing}
          style={{ width: size, height: size }}
        />
      </div>
    );
  }

  // Fallback path: animated emoji via Framer Motion. Uses transform + opacity
  // only so iPad Safari stays on the GPU path.
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      aria-hidden
    >
      <motion.span
        animate={
          playing
            ? { y: [0, -8, 0], scale: [1, 1.08, 1] }
            : { y: 0, scale: 1 }
        }
        transition={{
          duration: 1.4,
          repeat: playing ? Infinity : 0,
          ease: "easeInOut",
        }}
        style={{
          fontSize: Math.round(size * 0.82),
          lineHeight: 1,
          userSelect: "none",
        }}
      >
        {fallbackEmoji}
      </motion.span>
    </div>
  );
}

export default LottieStage;
