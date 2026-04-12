// src/hooks/useWakeLock.ts
//
// Thin wrapper around the Screen Wake Lock API so StudyScreen can request
// an "on" screen while a session is active, then release it on unmount.
// Silently no-ops on browsers that don't support it (notably some older
// iPad Safari versions).
//
// Returns imperative `acquire` / `release` so the caller can decide whether
// to only acquire on first interaction (iOS Safari historically required a
// user gesture).

import { useCallback, useEffect, useRef } from "react";

type WakeLockType = "screen";

interface WakeLockSentinel {
  released: boolean;
  type: WakeLockType;
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
  removeEventListener: (type: "release", listener: () => void) => void;
}

interface WakeLockAPI {
  request: (type: WakeLockType) => Promise<WakeLockSentinel>;
}

function getWakeLock(): WakeLockAPI | undefined {
  if (typeof navigator === "undefined") return undefined;
  // Not all browsers declare wakeLock on the Navigator type yet.
  return (navigator as unknown as { wakeLock?: WakeLockAPI }).wakeLock;
}

export interface UseWakeLockReturn {
  acquire: () => Promise<void>;
  release: () => void;
  isSupported: boolean;
}

export function useWakeLock(): UseWakeLockReturn {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const releasedListenerRef = useRef<(() => void) | null>(null);
  const failedRef = useRef(false);

  const isSupported = typeof getWakeLock() !== "undefined";

  const release = useCallback(() => {
    const s = sentinelRef.current;
    if (!s) return;
    try {
      if (releasedListenerRef.current) {
        s.removeEventListener("release", releasedListenerRef.current);
        releasedListenerRef.current = null;
      }
      void s.release();
    } catch {
      /* ignore */
    }
    sentinelRef.current = null;
  }, []);

  const acquire = useCallback(async () => {
    const api = getWakeLock();
    if (!api) return;
    if (sentinelRef.current && !sentinelRef.current.released) return;
    // Don't retry after a previous failure — avoids console spam and
    // re-render storms when the browser persistently denies the request.
    if (failedRef.current) return;
    try {
      const s = await api.request("screen");
      sentinelRef.current = s;
      failedRef.current = false;
      const listener = () => {
        if (sentinelRef.current === s) {
          sentinelRef.current = null;
        }
      };
      releasedListenerRef.current = listener;
      s.addEventListener("release", listener);
    } catch {
      failedRef.current = true;
    }
  }, []);

  // Re-acquire if the document becomes visible again after being hidden.
  useEffect(() => {
    if (!isSupported) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        // Reset failure flag on visibility — the user is back, gesture
        // context may have been re-established.
        failedRef.current = false;
        void acquire();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isSupported, acquire]);

  // Release on unmount automatically.
  useEffect(() => {
    return () => {
      release();
    };
  }, [release]);

  return { acquire, release, isSupported };
}
