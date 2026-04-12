// src/utils/date.ts
//
// Tiny date helpers used by queueBuilder / progressService. We keep these in
// one place so the "start-of-day" rule (local calendar day, not UTC) is only
// defined once. dayjs is re-exported for callers that need general date math.

import dayjs from "dayjs";

export { dayjs };

/**
 * Returns the epoch ms for 00:00 local time on the same calendar day as the
 * given timestamp. Used as the deterministic seed for "today"'s queue and as
 * the cutoff for `lastAdvancedAt` drip-item eligibility.
 */
export function startOfDay(ms: number = Date.now()): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Calendar days between two timestamps (local time). Negative if `b` is
 * earlier than `a`. We floor on `startOfDay` first so DST transitions don't
 * skew the result.
 */
export function daysSince(sinceMs: number, nowMs: number = Date.now()): number {
  const diff = startOfDay(nowMs) - startOfDay(sinceMs);
  return Math.floor(diff / 86_400_000);
}

/** `YYYY-MM-DD` local-date string, matching the sessionHistory index. */
export function localDateString(ms: number = Date.now()): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
