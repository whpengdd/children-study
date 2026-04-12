// src/hooks/useLatencyStart.ts
//
// React hook that captures `Date.now()` once on mount and returns the stable
// value on every re-render. Use in StudyScreen check slides so we can compute
// elapsed ms when the child submits an answer.

import { useRef } from "react";

import { latencyStart } from "../utils/latency";

/**
 * Returns the epoch-ms moment this component first rendered. Stable across
 * re-renders; safe to pass into `measureLatency(start)`.
 */
export function useLatencyStart(): number {
  const ref = useRef<number | null>(null);
  if (ref.current === null) {
    ref.current = latencyStart();
  }
  return ref.current;
}
