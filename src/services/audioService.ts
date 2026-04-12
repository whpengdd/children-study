// src/services/audioService.ts
//
// Plays a spoken word. Two engines, tried in order:
//   1. Web Speech API (fast, offline, no network)
//   2. YouDao dictvoice (network, reliable on all platforms)
//
// iPad Safari gotchas handled:
//   - `unlock()` must be called inside a user gesture before any playback.
//     It "warms up" both speechSynthesis AND a persistent <audio> element so
//     subsequent non-gesture plays (like useEffect auto-play) go through.
//   - `cancel()` then immediate `speak()` is broken on Safari — we insert a
//     small delay to let the engine settle.
//   - If Web Speech's `onstart` doesn't fire within 600 ms we assume the
//     utterance was silently swallowed and fall back to YouDao.

export type Accent = "us" | "uk";

interface SpeakOptions {
  accent?: Accent;
  /** When true, skip the speechSynthesis path and go straight to YouDao. */
  forceFallback?: boolean;
}

let currentUtterance: SpeechSynthesisUtterance | null = null;
let defaultAccent: Accent = "us";
/** Incremented on every speakWord call; stale calls bail out before fallback. */
let speakGeneration = 0;

/**
 * A single persistent <audio> element reused for all YouDao playback.
 * Created lazily in `unlock()` during a user gesture so that iOS Safari
 * associates it with gesture context, allowing later non-gesture `.play()`.
 */
let sharedAudio: HTMLAudioElement | null = null;

/**
 * Set the default accent used by `speakWord` when no explicit accent is given.
 * Called from StudyScreen when the user's settings load.
 */
export function setDefaultAccent(accent: Accent): void {
  defaultAccent = accent;
}

function hasSpeechSynthesis(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.speechSynthesis !== "undefined" &&
    typeof window.SpeechSynthesisUtterance !== "undefined"
  );
}

/**
 * MUST be called inside a user gesture (pointerdown / click) before any
 * non-gesture playback will work on iPad Safari. Safe to call many times.
 *
 * It does two things:
 *   1. Speaks a silent utterance to unlock speechSynthesis.
 *   2. Creates + plays (briefly) an <audio> element so iOS lets us reuse
 *      it later for YouDao without a gesture.
 */
export function unlock(): void {
  // Unlock speechSynthesis
  if (hasSpeechSynthesis()) {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance("");
      u.volume = 0;
      window.speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  }

  // Unlock / warm up the shared <audio> element for YouDao fallback.
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = "auto";
    // A silent data URI "plays" instantly, just establishing the gesture link.
    try {
      // Tiny silent WAV: 44-byte header, 0 data samples.
      sharedAudio.src =
        "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGFOYQAAAABk";
      const p = sharedAudio.play();
      if (p) p.catch(() => {});
    } catch {
      /* ignore */
    }
  }
}

/** Cancel anything currently playing. Idempotent. */
export function cancel(): void {
  if (hasSpeechSynthesis()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
  currentUtterance = null;
  if (sharedAudio) {
    try {
      sharedAudio.pause();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Speak a single word. Tries Web Speech first; if the utterance doesn't
 * actually start within 300 ms (Safari silently drops non-gesture calls),
 * automatically falls back to YouDao dictvoice audio.
 */
export async function speakWord(
  word: string,
  opts: SpeakOptions = {},
): Promise<void> {
  const trimmed = (word ?? "").trim();
  if (!trimmed) return;

  const gen = ++speakGeneration;
  cancel();

  // Safari needs a micro-gap after cancel() before the next speak() call
  // actually takes effect. One animation frame is enough — avoids the
  // 50 ms fixed delay that caused race conditions with rapid slide changes.
  await nextFrame();
  if (gen !== speakGeneration) return;

  const accent: Accent = opts.accent ?? defaultAccent;

  if (!opts.forceFallback && hasSpeechSynthesis()) {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const started = await trySpeechSynthesis(trimmed, accent);
      if (started) return;
      if (gen !== speakGeneration) return;
    }
  }

  if (gen !== speakGeneration) return;
  await playYouDao(trimmed, accent);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Wait one animation frame — minimal gap for Safari cancel→speak settle. */
function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

/**
 * Attempt Web Speech. Returns true if the utterance actually started playing,
 * false if it was silently dropped (common on iPad Safari without a gesture).
 */
function trySpeechSynthesis(text: string, accent: Accent): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = accent === "uk" ? "en-GB" : "en-US";
      utter.rate = 0.9;
      utter.pitch = 1.0;

      let settled = false;
      const settle = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ok);
      };

      utter.onstart = () => settle(true);
      utter.onerror = () => settle(false);

      // If neither onstart nor onerror fires within 300 ms the utterance was
      // silently swallowed — signal failure so the caller can use YouDao.
      // 300 ms is fast enough to not block carousel transitions (4 s+).
      const timer = window.setTimeout(() => settle(false), 300);

      currentUtterance = utter;
      window.speechSynthesis.speak(utter);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Play a word via YouDao dictvoice. Reuses the shared <audio> element so
 * iOS Safari's gesture-unlock carries forward from the initial `unlock()`.
 */
async function playYouDao(word: string, accent: Accent): Promise<void> {
  const type = accent === "uk" ? 1 : 2; // YouDao: 1=UK, 2=US
  const url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${type}`;

  // Prefer the gesture-unlocked shared element. If it doesn't exist yet
  // (unlock was never called), create one — play() may still fail without
  // a gesture, but at least we try.
  const audio = sharedAudio ?? new Audio();
  if (!sharedAudio) sharedAudio = audio;

  try {
    audio.src = url;
    audio.currentTime = 0;
    await audio.play();
  } catch (err) {
    console.warn("[audioService] YouDao fallback failed:", err);
  }
}
