// src/components/PetAvatar.tsx
//
// Emoji-based pet avatar. Keeps the MVP self-contained — no asset downloads,
// no licensing, no broken images. Swap to <img> when real sprite art lands
// (see public/pet/sprites/placeholders.md).

import { motion } from "framer-motion";

import type { PetSpecies, PetStage } from "../types";

/**
 * Pet mood affects an optional facial overlay emoji, NOT the main sprite.
 * Keeps the look consistent between sad/happy/sleepy.
 */
export type PetMood = "happy" | "sad" | "sleepy" | "neutral";
export type PetAvatarSize = "sm" | "md" | "lg";

export interface PetAvatarProps {
  species: PetSpecies;
  stage: PetStage;
  mood?: PetMood;
  size?: PetAvatarSize;
  /** Optional click handler, e.g. to jump to PetHome. */
  onClick?: () => void;
}

// ---------------------------------------------------------------------------
// Emoji lookup tables
// ---------------------------------------------------------------------------

const SPRITE_MAP: Record<PetSpecies, Record<PetStage, string>> = {
  cat:    { egg: "🥚", baby: "🐱", child: "😺", teen: "😸", adult: "😻" },
  dog:    { egg: "🥚", baby: "🐶", child: "🐕", teen: "🦮", adult: "🐕‍🦺" },
  dragon: { egg: "🥚", baby: "🐉", child: "🐲", teen: "🐉", adult: "🐲" },
  owl:    { egg: "🥚", baby: "🦉", child: "🦉", teen: "🦉", adult: "🦉" },
  rabbit: { egg: "🥚", baby: "🐰", child: "🐇", teen: "🐰", adult: "🐇" },
};

const MOOD_OVERLAY: Record<PetMood, string | null> = {
  happy: "✨",
  sad: "💧",
  sleepy: "💤",
  neutral: null,
};

const SIZE_TO_PX: Record<PetAvatarSize, number> = {
  sm: 32,
  md: 56,
  lg: 96,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PetAvatar({
  species,
  stage,
  mood = "neutral",
  size = "md",
  onClick,
}: PetAvatarProps): JSX.Element {
  const px = SIZE_TO_PX[size];
  const sprite = SPRITE_MAP[species][stage];
  const overlay = MOOD_OVERLAY[mood];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${species} at stage ${stage}, mood ${mood}`}
      style={{
        position: "relative",
        width: px,
        height: px,
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: onClick ? "pointer" : "default",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <motion.span
        animate={{ y: [0, -3, 0] }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
        style={{
          fontSize: Math.round(px * 0.9),
          lineHeight: 1,
          userSelect: "none",
        }}
      >
        {sprite}
      </motion.span>
      {overlay && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: -2,
            right: -2,
            fontSize: Math.round(px * 0.35),
            lineHeight: 1,
            pointerEvents: "none",
          }}
        >
          {overlay}
        </span>
      )}
    </button>
  );
}
