// src/utils/latency.ts
//
// Latency helpers: StudyScreen starts a stopwatch when a check card mounts,
// then reads it on submit so we can infer FSRS rating from how long the kid
// hesitated. Kept tiny on purpose — no deps, no hooks. A proper React hook
// wrapper lives in src/hooks/useLatencyStart.ts.

/** Capture a start stamp right now. */
export function latencyStart(): number {
  return Date.now();
}

/**
 * Compute elapsed ms from a previously-captured start stamp. Clamped to a
 * non-negative integer so clock skew (e.g. system time change between mount
 * and submit) can't flip our FSRS rating into the wrong bucket.
 */
export function measureLatency(start: number, end: number = Date.now()): number {
  const ms = end - start;
  return ms < 0 ? 0 : Math.round(ms);
}
