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
//   - If Web Speech's `onstart` doesn't fire within 300 ms we assume the
//     utterance was silently swallowed and fall back to YouDao.
//
// IMPORTANT — `speakWord` resolves only after audio FINISHES (or a graceful
// timeout cap fires). Callers can safely `await speakWord(text)` and use the
// result as a "done" signal for slide auto-advance.

export type Accent = "us" | "uk";

interface SpeakOptions {
  accent?: Accent;
  /** When true, skip the speechSynthesis path and go straight to YouDao. */
  forceFallback?: boolean;
}

/** Hard ceiling on how long we'll wait for any single audio clip to "end". */
const MAX_AUDIO_WAIT_MS = 8000;
/** Time we wait for `onstart` before assuming Safari swallowed the utterance. */
const SPEECH_START_PROBE_MS = 300;

let defaultAccent: Accent = "us";
/** Incremented on every speakWord call; stale calls bail out before fallback. */
let speakGeneration = 0;
/**
 * Guard against React StrictMode + double-mount triggering 2-4 redundant
 * speakWord calls within the same render burst. If the SAME word is requested
 * within DEDUP_WINDOW_MS of the previous request, we skip the new request and
 * piggyback on the in-flight one instead.
 */
let lastSpeakWord = "";
let lastSpeakAt = 0;
let lastSpeakPromise: Promise<void> | null = null;
const DEDUP_WINDOW_MS = 250;

/**
 * Each in-flight speakWord registers a "force-resolve" hook so that `cancel()`
 * — or a newer `speakWord()` — can immediately wake any callers blocked on
 * the previous audio's onended/onerror, instead of stranding them for the
 * 8s timeout cap.
 */
const inFlightResolvers = new Set<() => void>();

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

  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = "auto";
    try {
      sharedAudio.src =
        "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGFOYQAAAABk";
      const p = sharedAudio.play();
      if (p) p.catch(() => {});
    } catch {
      /* ignore */
    }
  }
}

/**
 * Cancel anything currently playing. Idempotent.
 *
 * Bumps `speakGeneration` so any `speakWord` mid-await detects it's stale and
 * resolves immediately without hanging on the now-cancelled audio's `onended`.
 */
export function cancel(): void {
  speakGeneration += 1;
  lastSpeakPromise = null;
  lastSpeakWord = "";
  if (hasSpeechSynthesis()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
  if (sharedAudio) {
    try {
      sharedAudio.pause();
    } catch {
      /* ignore */
    }
  }
  flushInFlight();
}

function flushInFlight(): void {
  const resolvers = Array.from(inFlightResolvers);
  inFlightResolvers.clear();
  for (const r of resolvers) {
    try {
      r();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Speak a single word. Tries Web Speech first; if the utterance doesn't
 * actually start within `SPEECH_START_PROBE_MS` (Safari silently drops
 * non-gesture calls), automatically falls back to YouDao dictvoice audio.
 *
 * The returned promise resolves only after the audio has finished playing
 * (or a hard timeout / cancel fires). This is the contract the slide-advance
 * logic depends on: `await speakWord(...)` truly waits for the kid to hear it.
 */
export function speakWord(
  word: string,
  opts: SpeakOptions = {},
): Promise<void> {
  const trimmed = (word ?? "").trim();
  if (!trimmed) return Promise.resolve();

  // Dedup tight-window duplicate calls (StrictMode double-mount, parent
  // re-render thrash). Returning the in-flight promise means the caller still
  // gets the proper "audio finished" signal but we don't restart playback.
  const now = performance.now();
  if (
    lastSpeakPromise &&
    trimmed === lastSpeakWord &&
    now - lastSpeakAt < DEDUP_WINDOW_MS
  ) {
    return lastSpeakPromise;
  }

  lastSpeakWord = trimmed;
  lastSpeakAt = now;
  const promise = doSpeak(trimmed, opts);
  lastSpeakPromise = promise;
  return promise;
}

async function doSpeak(trimmed: string, opts: SpeakOptions): Promise<void> {
  const gen = ++speakGeneration;

  if (hasSpeechSynthesis()) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
  if (sharedAudio) {
    try {
      sharedAudio.pause();
    } catch {
      /* ignore */
    }
  }

  // Safari needs a micro-gap after cancel() before the next speak() call
  // actually takes effect. One animation frame is enough.
  await nextFrame();
  if (gen !== speakGeneration) return;

  const accent: Accent = opts.accent ?? defaultAccent;

  if (!opts.forceFallback && hasSpeechSynthesis()) {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      const ok = await trySpeechSynthesisFull(trimmed, accent, gen);
      if (gen !== speakGeneration) return;
      if (ok) return;
    }
  }

  if (gen !== speakGeneration) return;
  await playYouDao(trimmed, accent, gen);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

/**
 * Speak via Web Speech API and resolve only after the utterance finishes.
 * Returns false if the engine silently dropped the utterance (no `onstart`
 * within the probe window) so the caller can fall back to YouDao.
 */
function trySpeechSynthesisFull(
  text: string,
  accent: Accent,
  gen: number,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let started = false;
    let settled = false;
    let startTimer: number | undefined;
    let maxTimer: number | undefined;
    let forceResolve: (() => void) | null = null;

    const cleanup = () => {
      if (startTimer !== undefined) {
        clearTimeout(startTimer);
        startTimer = undefined;
      }
      if (maxTimer !== undefined) {
        clearTimeout(maxTimer);
        maxTimer = undefined;
      }
      if (forceResolve) {
        inFlightResolvers.delete(forceResolve);
        forceResolve = null;
      }
    };

    const settle = (ok: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(ok);
    };

    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = accent === "uk" ? "en-GB" : "en-US";
      utter.rate = 0.9;
      utter.pitch = 1.0;

      utter.onstart = () => {
        started = true;
        if (startTimer !== undefined) {
          clearTimeout(startTimer);
          startTimer = undefined;
        }
      };
      utter.onend = () => settle(true);
      utter.onerror = () => {
        // If we never started, signal failure so caller falls back to YouDao.
        // If we started but errored mid-speech, treat as "done" (don't double-play).
        settle(started);
      };

      // If a newer speakWord (or cancel) bumps the generation, wake us up
      // immediately so the caller's await doesn't hang.
      forceResolve = () => settle(true);
      inFlightResolvers.add(forceResolve);

      // If onstart never fires the engine swallowed the utterance — fall back.
      startTimer = window.setTimeout(() => {
        if (!started && !settled) settle(false);
      }, SPEECH_START_PROBE_MS);

      // Hard ceiling on speech duration in case onend never fires.
      maxTimer = window.setTimeout(() => settle(true), MAX_AUDIO_WAIT_MS);

      window.speechSynthesis.speak(utter);
    } catch {
      settle(false);
    }

    // If a newer call already cancelled this generation, bail immediately.
    if (gen !== speakGeneration) settle(true);
  });
}

/**
 * Play a word via YouDao dictvoice. Reuses the shared <audio> element so
 * iOS Safari's gesture-unlock carries forward from the initial `unlock()`.
 *
 * Resolves after `onended` or `onerror` (with a max-wait timeout cap) so that
 * `await speakWord(...)` truly waits for the audio to finish.
 */
async function playYouDao(word: string, accent: Accent, gen: number): Promise<void> {
  const type = accent === "uk" ? 1 : 2; // YouDao: 1=UK, 2=US
  const url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${type}`;

  const audio = sharedAudio ?? new Audio();
  if (!sharedAudio) sharedAudio = audio;

  return new Promise<void>((resolve) => {
    let settled = false;
    let maxTimer: number | undefined;
    let forceResolve: (() => void) | null = null;

    const cleanup = () => {
      audio.onended = null;
      audio.onerror = null;
      if (maxTimer !== undefined) {
        clearTimeout(maxTimer);
        maxTimer = undefined;
      }
      if (forceResolve) {
        inFlightResolvers.delete(forceResolve);
        forceResolve = null;
      }
    };

    const settle = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    audio.onended = () => settle();
    audio.onerror = () => settle();

    forceResolve = () => settle();
    inFlightResolvers.add(forceResolve);

    maxTimer = window.setTimeout(() => settle(), MAX_AUDIO_WAIT_MS);

    try {
      audio.src = url;
      audio.currentTime = 0;
      const p = audio.play();
      if (p && typeof p.catch === "function") {
        p.catch((err) => {
          console.warn("[audioService] YouDao fallback failed:", err);
          settle();
        });
      }
    } catch (err) {
      console.warn("[audioService] YouDao fallback failed:", err);
      settle();
    }

    // If a newer call already cancelled this generation, bail immediately.
    if (gen !== speakGeneration) settle();
  });
}
