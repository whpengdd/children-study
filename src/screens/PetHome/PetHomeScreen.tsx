// src/screens/PetHome/PetHomeScreen.tsx
//
// The pet's home page (/pet). Renders:
//   - HatchCeremony modal when no pet exists yet (first visit)
//   - Hero section:   big PetAvatar + name + stage label + PetStatsPanel
//   - Middle section: SkillList grid
//   - Bottom:         "喂养（去学单词）" primary CTA and "返回" link
//
// Data flow: on mount, we read the active profile (from useProfileStore first,
// falling back to the most-recent row in db.profiles), then fetch the pet and
// graduated-count via petService. Nothing is pushed into usePetStore — that
// store belongs to Agent-Study. Local useState is good enough here.

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

import { PetAvatar } from "../../components/PetAvatar";
import { db } from "../../data/db";
import {
  applyStatDecay,
  countGraduations,
  getPet,
} from "../../services/petService";
import { useProfileStore } from "../../store/useProfileStore";
import type { Pet, PetStage } from "../../types";

import { HatchCeremony } from "./HatchCeremony";
import { PetStatsPanel } from "./PetStatsPanel";
import { SkillList } from "./SkillList";

const STAGE_LABEL: Record<PetStage, string> = {
  egg: "蛋",
  baby: "幼儿",
  child: "儿童",
  teen: "少年",
  adult: "成年",
};

// ---------------------------------------------------------------------------
// Profile resolution helpers
// ---------------------------------------------------------------------------

/**
 * Return the best-effort profile id for this screen. Prefers the zustand
 * store (which is wired up by Agent-Shell), falls back to the most recent
 * Dexie row, and finally returns null — PetHomeScreen will redirect to `/`.
 */
async function resolveProfileId(
  storeProfileId: number | null,
): Promise<number | null> {
  if (storeProfileId != null) return storeProfileId;
  try {
    const all = await db.profiles.toArray();
    if (all.length === 0) return null;
    // Newest by lastActiveAt; stable tie-break on id.
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
// Main screen
// ---------------------------------------------------------------------------

export default function PetHomeScreen(): JSX.Element {
  const navigate = useNavigate();
  const activeProfile = useProfileStore((s) => s.activeProfile);

  const [profileId, setProfileId] = useState<number | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [pet, setPet] = useState<Pet | null>(null);
  const [graduatedCount, setGraduatedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showWelcome, setShowWelcome] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve profile id (once on mount). If none is available, redirect home.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = await resolveProfileId(activeProfile?.id ?? null);
      if (cancelled) return;
      setProfileId(id);
      setProfileLoading(false);
      if (id == null) {
        // Give the user a beat to see the screen before we bounce them home,
        // otherwise this looks like a flash.
        window.setTimeout(() => navigate("/"), 600);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProfile?.id, navigate]);

  // Load pet + graduation count whenever the profile id resolves.
  const loadPetState = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      // Daily soft-stat decay (safe — a no-op if 0 elapsed days).
      await applyStatDecay(id).catch(() => undefined);
      const [p, g] = await Promise.all([
        getPet(id),
        countGraduations(id),
      ]);
      setPet(p ?? null);
      setGraduatedCount(g);
    } catch (err) {
      console.error("[PetHomeScreen] load failed", err);
      setError("载入宠物失败，请稍后再试");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profileId != null) {
      loadPetState(profileId);
    }
  }, [profileId, loadPetState]);

  const handleHatched = useCallback(
    async (freshPet: Pet) => {
      setPet(freshPet);
      setShowWelcome(true);
      // Refresh graduation count even though it will be 0, so the rest of the
      // state reads cleanly.
      if (profileId != null) {
        const g = await countGraduations(profileId);
        setGraduatedCount(g);
      }
      window.setTimeout(() => setShowWelcome(false), 2500);
    },
    [profileId],
  );

  const handleSkillTap = useCallback(
    (skillId: string) => {
      navigate(`/show/${skillId}`);
    },
    [navigate],
  );

  // Stage-derived UI bits.
  const stageLabel = useMemo(
    () => (pet ? STAGE_LABEL[pet.stage] : ""),
    [pet],
  );

  // ----- Early returns --------------------------------------------------------

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50 text-slate-600">
        <span>读取档案中...</span>
      </div>
    );
  }

  if (profileId == null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50 text-slate-700 p-6">
        <div className="text-center">
          <p className="text-lg font-semibold">请先选择一个小朋友</p>
          <p className="text-sm text-slate-500 mt-2">正在跳转到档案页...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50 text-slate-600">
        <span>宠物正在醒来...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-amber-50 text-slate-700 gap-3 p-6">
        <p className="text-lg font-semibold">{error}</p>
        <button
          type="button"
          className="rounded-full bg-amber-500 px-5 py-2 text-white font-semibold"
          onClick={() => loadPetState(profileId)}
        >
          再试一次
        </button>
      </div>
    );
  }

  // ----- No pet yet → hatch ceremony ------------------------------------------

  if (!pet) {
    return <HatchCeremony profileId={profileId} onHatched={handleHatched} />;
  }

  // ----- Main pet home view ---------------------------------------------------

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-sky-50 via-amber-50 to-pink-50 flex flex-col">
      {/* Welcome toast */}
      <AnimatePresence>
        {showWelcome && (
          <motion.div
            initial={{ opacity: 0, y: -24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ duration: 0.3 }}
            className="fixed top-4 left-1/2 z-30 -translate-x-1/2
              rounded-full bg-amber-400 px-6 py-2 text-white font-bold shadow-lg"
            role="status"
            aria-live="polite"
          >
            欢迎 {pet.name}！🎉
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top hero (~40%) */}
      <section className="flex-[2] flex flex-col items-center justify-center gap-3 px-4 pt-6">
        <div className="flex flex-col items-center gap-2">
          <PetAvatar
            species={pet.species}
            stage={pet.stage}
            mood={pet.stage === "egg" ? "sleepy" : "happy"}
            size="lg"
          />
          <h1 className="text-2xl font-bold text-slate-800">
            {pet.name || "小宝贝"}
          </h1>
          <span className="inline-flex items-center rounded-full bg-white px-3 py-0.5 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-200">
            当前阶段：{stageLabel}
          </span>
        </div>
        <div className="w-full px-4 max-w-md mt-2">
          <PetStatsPanel pet={pet} graduatedCount={graduatedCount} />
        </div>
      </section>

      {/* Middle skill list (~40%) */}
      <section className="flex-[2] flex flex-col gap-3 px-4 pt-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-lg font-semibold text-slate-700">技能表演</h2>
          <span className="text-xs text-slate-500">
            已解锁 {pet.skills.length} / 7
          </span>
        </div>
        <SkillList
          pet={pet}
          graduatedCount={graduatedCount}
          onSkillTap={handleSkillTap}
        />
      </section>

      {/* Bottom CTA (~20%) */}
      <section className="flex-[1] flex flex-col items-center justify-end gap-2 p-4 pb-6">
        <button
          type="button"
          onClick={() => navigate("/path")}
          className="
            w-full max-w-md rounded-full bg-gradient-to-r from-amber-400 to-pink-500
            px-6 py-4 text-lg font-bold text-white shadow-md
            hover:shadow-lg active:scale-95 transition
          "
        >
          喂养（去学单词）
        </button>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          返回
        </button>
      </section>
    </div>
  );
}
