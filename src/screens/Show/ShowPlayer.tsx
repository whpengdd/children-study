// src/screens/Show/ShowPlayer.tsx
//
// Steps through a Show's `script` sequentially and renders the current step.
//
// Responsibilities:
//   - iterate `show.script` in order
//   - for `say`    → show dialog bubble + TTS-speak the EN portion
//   - for `emote`  → show large emoji w/ bounce animation
//   - for `action` → show emoji w/ scale animation (LottieStage fallback)
//   - for `speak_word` → highlight word card + TTS-speak the word
//   - for `wait`   → idle for `ms`
//   - skip button jumps to the end; completion fires `onComplete()` after 2s
//
// This component owns the playback state machine; ShowScreen is the shell.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { PetAvatar } from "../../components/PetAvatar";
import type { Pet, Show, ShowScriptStep } from "../../types";

import { LottieStage } from "./LottieStage";

export interface ShowPlayerProps {
  show: Show;
  /** The pet performing — used to render the avatar and pick moods. */
  pet: Pet;
  /** Called after the script has finished playing (with a small trailing delay). */
  onComplete: () => void;
}

// ---------------------------------------------------------------------------
// TTS helper
// ---------------------------------------------------------------------------

/**
 * Speak and wait for the audio to FINISH (not just start). Returns a promise
 * that resolves after `onend` fires (or a hard timeout cap fires inside
 * audioService). Callers can `await speakSoft(...)` to gate slide advance on
 * "the kid actually heard the line".
 */
async function speakSoft(text: string): Promise<void> {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return;
  try {
    const mod = await import("../../services/audioService");
    if (typeof mod.speakWord === "function") {
      await mod.speakWord(trimmed);
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    if (
      typeof window !== "undefined" &&
      typeof window.speechSynthesis !== "undefined"
    ) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(trimmed);
      utter.lang = "en-US";
      utter.rate = 0.95;
      utter.pitch = 1.05;
      await new Promise<void>((resolve) => {
        let done = false;
        const settle = () => {
          if (done) return;
          done = true;
          resolve();
        };
        utter.onend = settle;
        utter.onerror = settle;
        window.setTimeout(settle, 6000);
        window.speechSynthesis.speak(utter);
      });
    }
  } catch {
    /* ignore — silent fallback is OK */
  }
}

/** Cancel-safe sleep used to add a small post-speech cushion before advancing. */
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, Math.max(0, ms)));
}

/** Post-speech absorb pause for `say` and `speak_word` steps. */
const SPEECH_ABSORB_MS = 700;

/** Strip the Chinese portion from a bilingual line to get the "spoken" text. */
function englishSliceOf(text: string | undefined): string {
  if (!text) return "";
  // Stop at the first non-ASCII char — rough heuristic that is good enough for
  // the template library's bilingual format ("A is for apple 苹果").
  const chineseIdx = text.search(/[^\x00-\x7F]/);
  if (chineseIdx < 0) return text.trim();
  return text.slice(0, chineseIdx).trim();
}

// ---------------------------------------------------------------------------
// Step-kind → duration defaults (ms)
// ---------------------------------------------------------------------------

function stepDuration(step: ShowScriptStep): number {
  if (typeof step.ms === "number" && step.ms > 0) return step.ms;
  switch (step.kind) {
    case "say":
      return 2500;
    case "speak_word":
      return 2500;
    case "emote":
      return 1000;
    case "action":
      return 1500;
    case "wait":
      return 1000;
    default:
      return 1500;
  }
}

function moodForStep(step: ShowScriptStep): "happy" | "neutral" {
  if (step.kind === "emote" || step.kind === "action") return "happy";
  return "neutral";
}

// ---------------------------------------------------------------------------
// ShowPlayer
// ---------------------------------------------------------------------------

export function ShowPlayer({
  show,
  pet,
  onComplete,
}: ShowPlayerProps): JSX.Element {
  const script = show.script;
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const completionFired = useRef(false);

  // Stable onComplete so advance() doesn't re-bind every render.
  const handleComplete = useCallback(() => {
    if (completionFired.current) return;
    completionFired.current = true;
    onComplete();
  }, [onComplete]);

  // Drive the step-advancement loop. For speech steps (`say` / `speak_word`)
  // we await the TTS, then a small absorb pause, then advance — so the kid
  // actually hears the word before the next slide kicks in. The step's
  // configured `ms` becomes a MINIMUM floor (we race speech against it) so
  // emote-like timings are still respected. For non-speech steps we keep the
  // original setTimeout behavior.
  useEffect(() => {
    if (finished) return;
    if (script.length === 0) {
      setFinished(true);
      return;
    }
    if (index >= script.length) {
      setFinished(true);
      return;
    }

    const step = script[index];
    let cancelled = false;
    let timer: number | undefined;

    const advanceIfLive = () => {
      if (cancelled) return;
      setIndex((i) => i + 1);
    };

    if (step.kind === "say" || step.kind === "speak_word") {
      const spoken =
        step.kind === "speak_word"
          ? step.word ?? englishSliceOf(step.text)
          : englishSliceOf(step.text);
      const minMs = stepDuration(step);
      const minDelay = delay(minMs);
      const speechDone = spoken ? speakSoft(spoken) : Promise.resolve();
      // Race nothing — wait for BOTH the TTS to finish AND the min-floor.
      void Promise.all([speechDone, minDelay]).then(async () => {
        if (cancelled) return;
        await delay(SPEECH_ABSORB_MS);
        advanceIfLive();
      });
    } else {
      timer = window.setTimeout(advanceIfLive, stepDuration(step));
    }

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      // Aborts any in-flight TTS so the next step doesn't have to fight it.
      void import("../../services/audioService").then((mod) => {
        try {
          mod.cancel();
        } catch {
          /* ignore */
        }
      });
    };
  }, [index, script, finished]);

  // 2s trailing delay after the last step, then onComplete.
  useEffect(() => {
    if (!finished) return;
    const t = window.setTimeout(() => handleComplete(), 2000);
    return () => window.clearTimeout(t);
  }, [finished, handleComplete]);

  // Skip button: abort any in-flight TTS, then jump to the end.
  const handleSkip = useCallback(() => {
    void import("../../services/audioService").then((mod) => {
      try {
        mod.cancel();
      } catch {
        /* ignore */
      }
    });
    setFinished(true);
  }, []);

  const currentStep = !finished && index < script.length ? script[index] : null;
  const mood = useMemo(
    () => (currentStep ? moodForStep(currentStep) : "happy"),
    [currentStep],
  );

  // Progress indicator
  const progress = script.length > 0
    ? Math.min(100, Math.round(((finished ? script.length : index) / script.length) * 100))
    : 100;

  return (
    <div className="relative w-full h-full min-h-screen flex flex-col items-center justify-between bg-slate-900 text-white">
      {/* Top: progress bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-slate-800">
        <motion.div
          className="h-full bg-amber-400"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.25 }}
        />
      </div>

      {/* Pet avatar — always visible */}
      <div className="mt-16 flex flex-col items-center gap-2">
        <PetAvatar
          species={pet.species}
          stage={pet.stage}
          mood={mood}
          size="lg"
        />
        <p className="text-xs uppercase tracking-widest text-slate-400">
          {pet.name || "小宝贝"}
        </p>
      </div>

      {/* Step body */}
      <div className="flex-1 w-full flex items-center justify-center px-6">
        <AnimatePresence mode="wait">
          {finished ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.4 }}
              className="text-center"
            >
              <div className="text-7xl mb-3" aria-hidden>
                🎉
              </div>
              <p className="text-2xl font-bold">表演结束！</p>
              <p className="text-sm text-slate-300 mt-2">
                马上返回宠物主页...
              </p>
            </motion.div>
          ) : currentStep ? (
            <StepView key={`step-${index}`} step={currentStep} />
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-slate-400"
            >
              准备中...
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom: step counter + skip button */}
      <div className="w-full flex items-center justify-between px-6 pb-6">
        <span className="text-xs text-slate-500 tabular-nums">
          {Math.min(index + 1, script.length)} / {script.length}
        </span>
        {!finished && (
          <button
            type="button"
            onClick={handleSkip}
            className="
              rounded-full bg-slate-700/70 px-4 py-2 text-sm font-semibold text-white
              hover:bg-slate-600/80 active:scale-95 transition
            "
            aria-label="跳过剩余表演"
          >
            跳过 ▶
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-step view (framer-motion transitions)
// ---------------------------------------------------------------------------

interface StepViewProps {
  step: ShowScriptStep;
}

function StepView({ step }: StepViewProps): JSX.Element {
  switch (step.kind) {
    case "say":
      return (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25 }}
          className="max-w-xl"
        >
          <div
            className="
              relative rounded-3xl bg-white/10 px-6 py-5 text-center text-2xl
              font-semibold leading-relaxed backdrop-blur-sm ring-1 ring-white/20
            "
          >
            {step.text ?? ""}
          </div>
        </motion.div>
      );

    case "emote":
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{
            opacity: 1,
            scale: [1, 1.15, 1],
            y: [0, -10, 0],
          }}
          exit={{ opacity: 0, scale: 0.7 }}
          transition={{ duration: 0.9, ease: "easeInOut" }}
          className="text-8xl"
          aria-hidden
        >
          {step.emoji ?? "✨"}
        </motion.div>
      );

    case "action":
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: [0.9, 1.2, 1] }}
          exit={{ opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.7 }}
          className="flex flex-col items-center gap-2"
        >
          <LottieStage fallbackEmoji={step.emoji ?? "🎭"} size={160} />
          {step.text && (
            <p className="text-base text-slate-200 text-center">
              {step.text}
            </p>
          )}
        </motion.div>
      );

    case "speak_word":
      return (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.95 }}
          transition={{ duration: 0.25 }}
          className="max-w-xl w-full"
        >
          <div
            className="
              flex flex-col items-center gap-3 rounded-3xl bg-gradient-to-br
              from-amber-300 to-pink-400 px-8 py-6 text-slate-900 shadow-xl
            "
          >
            <span className="text-xs uppercase tracking-widest text-amber-900/70">
              🔊 Say it with me
            </span>
            <p className="text-5xl font-black tracking-wide">
              {step.word ?? "?"}
            </p>
            {step.text && (
              <p className="text-base font-medium text-slate-800 text-center">
                {step.text}
              </p>
            )}
          </div>
        </motion.div>
      );

    case "wait":
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          exit={{ opacity: 0 }}
          className="text-4xl text-slate-500"
          aria-hidden
        >
          ...
        </motion.div>
      );

    default:
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="text-sm text-slate-400"
        >
          (unknown step)
        </motion.div>
      );
  }
}

export default ShowPlayer;
