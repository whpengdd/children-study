// src/hooks/useAutoCarousel.ts
//
// Tier-aware auto-advance timer. StudyScreen enables it when the current
// scenario is Tier 1 (passive carousel) with the settings-derived Tier-1
// duration, or when ambient mode is on during Tier 2-4 with a longer timeout.
//
// Contract:
//   useAutoCarousel({ active, duration, onExpire, resetToken? })
//
//   - When `active` flips true → start a timer for `duration` ms.
//   - When the timer fires → call `onExpire`.
//   - When `active` flips false → clear the timer (no callback).
//   - Changing `duration` while the timer is running resets it.
//   - Changing `resetToken` (e.g. the queue index) restarts the timer, which
//     guarantees each new slide gets a fresh countdown even when React batches
//     the intermediate `active` toggle away during a fast advance.

import { useEffect, useRef } from "react";

export interface UseAutoCarouselOpts {
  /** Enable/disable the timer. Flipping false cancels any pending expire. */
  active: boolean;
  /** Milliseconds after which the timer fires. */
  duration: number;
  /** Callback fired exactly once per active window. */
  onExpire: () => void;
  /**
   * Opaque token that, when it changes, forces the timer to restart even if
   * `active` and `duration` stayed the same. Pass the queue index or slide key
   * so that each new slide always gets a fresh countdown regardless of whether
   * React batched the intermediate `active` toggle away.
   */
  resetToken?: unknown;
}

export function useAutoCarousel({
  active,
  duration,
  onExpire,
  resetToken,
}: UseAutoCarouselOpts): void {
  // Stash the callback in a ref so changing it mid-timer doesn't reset the
  // timer — only `active`, `duration`, and `resetToken` should.
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!active) return;
    const d = Math.max(0, duration | 0);
    const id = window.setTimeout(() => {
      onExpireRef.current();
    }, d);
    return () => {
      window.clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, duration, resetToken]);
}
