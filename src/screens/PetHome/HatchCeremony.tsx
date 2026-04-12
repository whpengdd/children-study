// src/screens/PetHome/HatchCeremony.tsx
//
// First-time pet creation. Shown from PetHomeScreen whenever
// `petService.getPet(profileId)` returns undefined.
//
// Flow:
//   1. A big pulsing egg emoji welcomes the child.
//   2. They pick a species from 5 tappable cards.
//   3. They type a name (max 10 chars).
//   4. "孵化！" button -> petService.hatchPet(profileId, species, name).
//   5. A short celebration animation fires, then onHatched() hands control
//      back to the parent (PetHomeScreen) which re-loads the pet.
//
// Everything is self-contained — no store writes, no navigation. The parent
// owns the "after hatch" transition.

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { hatchPet } from "../../services/petService";
import type { Pet, PetSpecies } from "../../types";

export interface HatchCeremonyProps {
  profileId: number;
  /** Called once the pet has been persisted. */
  onHatched: (pet: Pet) => void;
}

interface SpeciesOption {
  id: PetSpecies;
  emoji: string;
  label: string;
}

const SPECIES: SpeciesOption[] = [
  { id: "cat",    emoji: "🐱", label: "小猫" },
  { id: "dog",    emoji: "🐶", label: "小狗" },
  { id: "dragon", emoji: "🐉", label: "小龙" },
  { id: "owl",    emoji: "🦉", label: "猫头鹰" },
  { id: "rabbit", emoji: "🐰", label: "兔子" },
];

const MAX_NAME_LEN = 10;

export function HatchCeremony({
  profileId,
  onHatched,
}: HatchCeremonyProps): JSX.Element {
  const [species, setSpecies] = useState<PetSpecies | null>(null);
  const [name, setName] = useState("");
  const [hatching, setHatching] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canHatch =
    species !== null && name.trim().length > 0 && !hatching && !celebrating;

  async function handleHatch() {
    if (!species) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    setHatching(true);
    try {
      const pet = await hatchPet(profileId, species, trimmed);
      // Show the celebration briefly, THEN hand off to parent.
      setCelebrating(true);
      window.setTimeout(() => {
        onHatched(pet);
      }, 1200);
    } catch (err) {
      console.error("[HatchCeremony] hatchPet failed", err);
      setError("孵化失败，再试一次吧！");
      setHatching(false);
    }
  }

  return (
    <div
      className="
        fixed inset-0 z-50 flex items-center justify-center
        bg-gradient-to-br from-sky-100 via-pink-100 to-amber-100
        p-6 overflow-auto
      "
      role="dialog"
      aria-modal="true"
      aria-label="宠物孵化仪式"
    >
      <div className="w-full max-w-md flex flex-col items-center gap-6">
        {/* Hero: pulsing egg (or hatching celebration) */}
        <AnimatePresence mode="wait">
          {!celebrating ? (
            <motion.div
              key="egg"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="flex flex-col items-center gap-2"
            >
              <motion.span
                aria-hidden
                animate={{ scale: [1, 1.06, 1] }}
                transition={{
                  duration: 1.4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                style={{ fontSize: 120, lineHeight: 1 }}
              >
                🥚
              </motion.span>
              <h1 className="text-2xl font-bold text-slate-800 text-center">
                为你的小伙伴起个名字吧！
              </h1>
              <p className="text-sm text-slate-600 text-center">
                选择物种、起名字，然后一起开始冒险
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="hatch"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="flex flex-col items-center gap-2"
            >
              <motion.span
                aria-hidden
                animate={{ rotate: [0, -8, 8, -4, 0], scale: [1, 1.2, 1] }}
                transition={{ duration: 1, ease: "easeOut" }}
                style={{ fontSize: 140, lineHeight: 1 }}
              >
                {SPECIES.find((s) => s.id === species)?.emoji ?? "✨"}
              </motion.span>
              <h1 className="text-2xl font-bold text-slate-800 text-center">
                欢迎，{name.trim() || "小伙伴"}！
              </h1>
              <p className="text-sm text-slate-600 text-center">
                孵化成功 🎉
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Species picker */}
        {!celebrating && (
          <div className="w-full">
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              选择一个伙伴
            </label>
            <div className="grid grid-cols-5 gap-2">
              {SPECIES.map((s) => {
                const active = species === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSpecies(s.id)}
                    className={`
                      flex flex-col items-center gap-1 rounded-2xl p-2 text-xs
                      ring-1 transition
                      ${
                        active
                          ? "bg-amber-200 ring-amber-400 scale-105"
                          : "bg-white ring-slate-200 hover:bg-amber-50"
                      }
                    `}
                    aria-pressed={active}
                    aria-label={s.label}
                  >
                    <span aria-hidden className="text-3xl">
                      {s.emoji}
                    </span>
                    <span className="text-slate-600">{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Name input */}
        {!celebrating && (
          <div className="w-full">
            <label
              htmlFor="pet-name-input"
              className="block text-sm font-semibold text-slate-700 mb-2"
            >
              给它起个名字（最多 {MAX_NAME_LEN} 字）
            </label>
            <input
              id="pet-name-input"
              type="text"
              value={name}
              maxLength={MAX_NAME_LEN}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：小白"
              className="
                w-full rounded-2xl border border-slate-200 bg-white px-4 py-3
                text-center text-lg font-semibold text-slate-800
                focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300
              "
              disabled={hatching}
            />
          </div>
        )}

        {/* Hatch button */}
        {!celebrating && (
          <button
            type="button"
            onClick={handleHatch}
            disabled={!canHatch}
            className={`
              w-full rounded-full px-6 py-4 text-lg font-bold text-white shadow-md
              transition
              ${
                canHatch
                  ? "bg-gradient-to-r from-amber-400 to-pink-500 hover:shadow-lg active:scale-95"
                  : "bg-slate-300 cursor-not-allowed"
              }
            `}
          >
            {hatching ? "孵化中..." : "孵化！"}
          </button>
        )}

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

export default HatchCeremony;
