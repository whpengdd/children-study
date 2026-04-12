// src/screens/Show/ShowScreen.tsx
//
// Full-screen pet performance (/show/:skillId). On mount:
//   1. resolve active profile
//   2. fetch the pet (required)
//   3. call showService.triggerShow(profileId, skillId) → Show
//   4. render <ShowPlayer> to play it
//
// Failure modes all degrade gracefully:
//   - no profile   → redirect to `/`
//   - no pet       → redirect to `/pet` (HatchCeremony will show)
//   - trigger fail → error state with back button
//
// While loading, we show a small PetAvatar bouncing with "准备中..." copy.

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { PetAvatar } from "../../components/PetAvatar";
import { db } from "../../data/db";
import { getPet } from "../../services/petService";
import { triggerShow } from "../../services/showService";
import { useProfileStore } from "../../store/useProfileStore";
import type { Pet, Show } from "../../types";

import { LottieStage } from "./LottieStage";
import { ShowPlayer } from "./ShowPlayer";

// ---------------------------------------------------------------------------
// Profile id resolution — mirrors PetHomeScreen.
// ---------------------------------------------------------------------------

async function resolveProfileId(
  storeProfileId: number | null,
): Promise<number | null> {
  if (storeProfileId != null) return storeProfileId;
  try {
    const all = await db.profiles.toArray();
    if (all.length === 0) return null;
    all.sort((a, b) => {
      const ta = a.lastActiveAt ?? "";
      const tb = b.lastActiveAt ?? "";
      if (ta === tb) return (b.id ?? 0) - (a.id ?? 0);
      return tb.localeCompare(ta);
    });
    return all[0]?.id ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// ShowScreen
// ---------------------------------------------------------------------------

type LoadPhase = "profile" | "pet" | "show" | "ready" | "error";

export default function ShowScreen(): JSX.Element {
  const navigate = useNavigate();
  const { skillId } = useParams<{ skillId: string }>();
  const activeProfile = useProfileStore((s) => s.activeProfile);

  const [phase, setPhase] = useState<LoadPhase>("profile");
  const [pet, setPet] = useState<Pet | null>(null);
  const [show, setShow] = useState<Show | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ----- Loading pipeline -----------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Phase 1: resolve profile id
        setPhase("profile");
        const profileId = await resolveProfileId(activeProfile?.id ?? null);
        if (cancelled) return;
        if (profileId == null) {
          window.setTimeout(() => navigate("/"), 500);
          return;
        }

        // Phase 2: load pet
        setPhase("pet");
        const p = await getPet(profileId);
        if (cancelled) return;
        if (!p) {
          // Bounce back to PetHome so HatchCeremony can run.
          window.setTimeout(() => navigate("/pet"), 500);
          return;
        }
        setPet(p);

        // Phase 3: load show
        if (!skillId) {
          setError("缺少技能 ID");
          setPhase("error");
          return;
        }
        setPhase("show");
        const result = await triggerShow(profileId, skillId);
        if (cancelled) return;
        setShow(result);
        setPhase("ready");
      } catch (err) {
        if (cancelled) return;
        console.error("[ShowScreen] load failed", err);
        setError("宠物今天有点害羞，稍后再试吧");
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProfile?.id, navigate, skillId]);

  const handleComplete = useCallback(() => {
    navigate("/pet");
  }, [navigate]);

  const handleBack = useCallback(() => {
    navigate("/pet");
  }, [navigate]);

  // ----- Render phases --------------------------------------------------------

  if (phase === "error") {
    return (
      <div className="min-h-screen w-full bg-slate-900 text-white flex flex-col items-center justify-center gap-4 p-6">
        <div className="text-6xl" aria-hidden>
          😿
        </div>
        <p className="text-lg font-semibold">Oops</p>
        <p className="text-sm text-slate-400 text-center">
          {error ?? "表演没能开始"}
        </p>
        <button
          type="button"
          onClick={handleBack}
          className="rounded-full bg-amber-500 px-6 py-2 font-bold text-white shadow hover:shadow-lg active:scale-95 transition"
        >
          返回宠物主页
        </button>
      </div>
    );
  }

  if (phase !== "ready" || !show || !pet) {
    return (
      <div className="min-h-screen w-full bg-slate-900 text-white flex flex-col items-center justify-center gap-4 p-6">
        {pet ? (
          <PetAvatar
            species={pet.species}
            stage={pet.stage}
            mood="happy"
            size="lg"
          />
        ) : (
          <LottieStage fallbackEmoji="🥚" size={120} />
        )}
        <p className="text-base text-slate-200">
          宠物正在准备中...
        </p>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse [animation-delay:150ms]" />
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse [animation-delay:300ms]" />
        </div>
        <button
          type="button"
          onClick={handleBack}
          className="mt-4 text-xs text-slate-400 hover:text-slate-200 underline"
        >
          取消
        </button>
      </div>
    );
  }

  // Ready state — hand off to the player.
  return <ShowPlayer show={show} pet={pet} onComplete={handleComplete} />;
}
