// src/screens/Study/PetCompanion.tsx
//
// Bottom-right corner companion that the StudyScreen embeds in Wave 2. We
// subscribe READ-ONLY to usePetStore — any writes happen through petService
// (which StudyScreen itself drives via progressService → petService glue).
//
// This file deliberately does NOT import StudyScreen.tsx or any other file in
// screens/Study; Agent-Slides owns everything else in this folder.

import { useEffect, useState } from "react";

import { PetAvatar, type PetMood } from "../../components/PetAvatar";
import { PetReaction, type PetReactionKind } from "../../components/PetReaction";
import { XpGainToast } from "../../components/XpGainToast";
import { usePetStore } from "../../store/usePetStore";

export interface PetCompanionProps {
  profileId: number;
}

/**
 * Map the pet's softest stat to a mood. The thresholds are generous so the
 * companion only looks sad / sleepy on genuinely neglected pets.
 */
function moodFromStats(
  hunger: number,
  happiness: number,
  energy: number,
): PetMood {
  if (happiness >= 70 && hunger >= 50) return "happy";
  if (happiness < 30) return "sad";
  if (energy < 25) return "sleepy";
  return "neutral";
}

export function PetCompanion({ profileId }: PetCompanionProps): JSX.Element | null {
  const pet = usePetStore((s) => s.pet);
  const lastXpGain = usePetStore((s) => s.lastXpGain);
  const loadPet = usePetStore((s) => s.loadPet);

  const [reaction, setReaction] = useState<PetReactionKind | null>(null);
  const [xpToastKey, setXpToastKey] = useState(0);

  // Kick off an initial load. Wave 2 StudyScreen may have already done this,
  // but a double-call is a no-op (store is idempotent on its own).
  useEffect(() => {
    void loadPet(profileId);
  }, [profileId, loadPet]);

  // Whenever lastXpGain ticks upward, flash a reaction + xp toast.
  useEffect(() => {
    if (lastXpGain > 0) {
      setReaction("correct");
      setXpToastKey((k) => k + 1);
    } else if (lastXpGain < 0) {
      setReaction("wrong");
    }
  }, [lastXpGain]);

  if (!pet) return null;

  const mood = moodFromStats(
    pet.stats.hunger,
    pet.stats.happiness,
    pet.stats.energy,
  );

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 4,
        zIndex: 40,
        pointerEvents: "none",
      }}
    >
      {reaction && (
        <div style={{ pointerEvents: "auto" }}>
          <PetReaction
            reaction={reaction}
            onDismiss={() => setReaction(null)}
          />
        </div>
      )}
      {lastXpGain > 0 && (
        <div key={xpToastKey} style={{ pointerEvents: "none" }}>
          <XpGainToast xp={lastXpGain} />
        </div>
      )}
      <div style={{ pointerEvents: "auto" }}>
        <PetAvatar
          species={pet.species}
          stage={pet.stage}
          mood={mood}
          size="md"
        />
      </div>
    </div>
  );
}
