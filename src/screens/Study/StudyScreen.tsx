// src/screens/Study/StudyScreen.tsx
//
// Wave 2 (Agent-Study). Main learning experience. Renders the queued
// SessionItem at the current cursor, wires slide callbacks into
// progressService → petService, and draws the persistent pet companion + XP
// toast in the bottom-right corner.
//
// Session flow:
//   1. On mount: pull profileId, path, settings from stores.
//      - If anything is missing, redirect to the corresponding gate.
//   2. loadQueue(profileId, path, settings) → buildTodayQueue.
//   3. Iterate:
//        - Tier 1 slide → onExposureDone → completeExposure → handleLearningEvent → advance.
//        - Tier 2-4 slide → onSubmit(correct) → submitCheck → handleLearningEvent.
//        - Tier 5 review → onSubmit(correct) → submitReview → handleLearningEvent.
//        - If correct, advance after a small delay.
//        - If wrong, keep the slide mounted (its own retry UI takes over).
//   4. On exhaust: show the "Session complete!" summary.
//
// This file is the primary wiring surface. It deliberately does not reach
// into any slide internals or re-implement queueBuilder logic.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { XpGainToast } from "../../components/XpGainToast";
import { PetReaction } from "../../components/PetReaction";
import { useAutoCarousel } from "../../hooks/useAutoCarousel";
import { useSpeak } from "../../hooks/useSpeak";
import { useWakeLock } from "../../hooks/useWakeLock";
import { setDefaultAccent } from "../../services/audioService";
import { handleLearningEvent } from "../../services/learningGlue";
import * as progressService from "../../services/progressService";
import { usePathStore } from "../../store/usePathStore";
import { usePetStore } from "../../store/usePetStore";
import { useProfileStore } from "../../store/useProfileStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import { useStudyStore } from "../../store/useStudyStore";
import type { SessionItem, Settings } from "../../types";

import * as profileService from "../../services/profileService";
import * as petService from "../../services/petService";
import { db } from "../../data/db";

import CarouselControls from "./CarouselControls";
import { PetCompanion } from "./PetCompanion";
import ScenarioSlide from "./ScenarioSlide";
import StudyTopBar from "./StudyTopBar";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Ms to linger on a correct answer before advancing (lets the banner play). */
const CORRECT_ADVANCE_DELAY_MS = 900;
/** Default Tier 1 auto-advance duration when settings omit it. */
const DEFAULT_TIER1_MS = 4000;
/** Ambient-mode Tier 2-4 auto-skip duration. */
const AMBIENT_SKIP_MS = 15000;

const CAROUSEL_SPEED_MS: Record<"slow" | "normal" | "fast", number> = {
  slow: 5500,
  normal: 4000,
  fast: 2800,
};

// ---------------------------------------------------------------------------
// Props for the shared inner. ReviewScreen reuses the same body with
// `reviewOnly: true`.
// ---------------------------------------------------------------------------

export interface StudyScreenProps {
  /** When true, only review items are kept in the queue. */
  reviewOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

export default function StudyScreen({ reviewOnly = false }: StudyScreenProps) {
  const navigate = useNavigate();

  const activeProfile = useProfileStore((s) => s.activeProfile);
  const path = usePathStore((s) => s.path);
  const settings = useSettingsStore((s) => s.settings);
  const loadForProfile = useSettingsStore((s) => s.loadForProfile);

  const queue = useStudyStore((s) => s.queue);
  const index = useStudyStore((s) => s.index);
  const status = useStudyStore((s) => s.status);
  const sessionStats = useStudyStore((s) => s.sessionStats);
  const lastReward = useStudyStore((s) => s.lastReward);
  const loadQueue = useStudyStore((s) => s.loadQueue);
  const advance = useStudyStore((s) => s.advance);
  const reset = useStudyStore((s) => s.reset);
  const clearLastReward = useStudyStore((s) => s.clearLastReward);
  const markSeen = useStudyStore((s) => s.markSeen);
  const recordCorrect = useStudyStore((s) => s.recordCorrect);
  const recordWrong = useStudyStore((s) => s.recordWrong);
  const recordGraduated = useStudyStore((s) => s.recordGraduated);
  const recordReviewCompleted = useStudyStore((s) => s.recordReviewCompleted);
  const recordNewWordStart = useStudyStore((s) => s.recordNewWordStart);

  const loadPet = usePetStore((s) => s.loadPet);

  const { acquire: acquireWakeLock, release: releaseWakeLock } = useWakeLock();
  const { unlock: unlockAudio, cancel: cancelSpeak } = useSpeak(
    settings?.voiceAccent ?? "us",
  );

  const [paused, setPaused] = useState(false);
  const [slideKey, setSlideKey] = useState(0);
  const [slideDisabled, setSlideDisabled] = useState(false);
  const [devBootDone, setDevBootDone] = useState(false);

  // Ref guards to dedupe rapid-fire callbacks while a transition animates.
  const transitioningRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Settings / session bootstrap
  // ---------------------------------------------------------------------------

  // Dev-only self-bootstrap: if `?devBoot=1` is present on the URL and there
  // is no active profile, create one + set a default path + hatch a pet. This
  // is the escape hatch Agent-Study uses for its own smoke tests before the
  // full ProfileGate / PathSelect screens land. No-op in the normal flow.
  useEffect(() => {
    if (devBootDone) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("devBoot") !== "1") {
      setDevBootDone(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // Reuse an existing "DevTester" profile if one already lives in Dexie.
        let profile = await db.profiles.where("name").equals("DevTester").first();
        if (!profile) {
          profile = await profileService.createProfile({
            name: "DevTester",
            avatarEmoji: "🦊",
          });
        }
        if (cancelled || !profile?.id) return;
        // Prime the profile store.
        useProfileStore.setState({ activeProfile: profile });
        // Default path = PEP grade 3 (matches the mock catalog).
        await usePathStore.getState().setPathForProfile(profile.id, {
          kind: "pep",
          grade: 3,
        });
        // Make sure a pet exists (hatch as egg if absent).
        const existing = await db.pets.get(profile.id);
        if (!existing) {
          await petService.hatchPet(profile.id, "cat", "Mochi");
        }
      } catch (err) {
        console.warn("[StudyScreen devBoot] failed:", err);
      } finally {
        if (!cancelled) setDevBootDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [devBootDone]);

  // No profile → back to gate.
  useEffect(() => {
    if (!devBootDone) return;
    if (!activeProfile?.id) {
      navigate("/", { replace: true });
    }
  }, [devBootDone, activeProfile, navigate]);

  // No path → back to path select.
  useEffect(() => {
    if (!devBootDone) return;
    if (activeProfile?.id && !path) {
      navigate("/path", { replace: true });
    }
  }, [devBootDone, activeProfile, path, navigate]);

  // Kick settings load. If the stub returns nothing, we fall back to
  // hard-coded defaults so the screen can still run.
  useEffect(() => {
    if (!activeProfile?.id) return;
    void loadForProfile(activeProfile.id);
  }, [activeProfile, loadForProfile]);

  const effectiveSettings: Settings | null = useMemo(() => {
    if (!activeProfile?.id) return null;
    if (settings) return settings;
    // Synthetic defaults keep the screen functional even if Agent-Shell hasn't
    // wired useSettingsStore.loadSettings yet.
    return {
      profileId: activeProfile.id,
      ambientMode: false,
      carouselSpeed: "normal",
      voiceAccent: "us",
      maxNewWordsPerSession: 10,
      dueLookaheadMs: 86_400_000,
      showGenerationMode: "offline",
      dailyShowAiQuota: 1,
    };
  }, [settings, activeProfile]);

  // Load queue once we have profile + path + settings.
  useEffect(() => {
    if (!activeProfile?.id || !path || !effectiveSettings) return;
    void loadQueue(activeProfile.id, path, effectiveSettings, { reviewOnly });
    void loadPet(activeProfile.id);
  }, [
    activeProfile,
    path,
    effectiveSettings,
    reviewOnly,
    loadQueue,
    loadPet,
  ]);

  // Sync the user's accent preference into the audio module so every
  // `speak()` call across all slides picks it up without needing props.
  useEffect(() => {
    if (effectiveSettings?.voiceAccent) {
      setDefaultAccent(effectiveSettings.voiceAccent);
    }
  }, [effectiveSettings?.voiceAccent]);

  // Reset on unmount so navigating away clears the session.
  useEffect(() => {
    return () => {
      reset();
      cancelSpeak();
    };
  }, [reset, cancelSpeak]);

  // Acquire screen wake lock while mounted.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    void acquireWakeLock();
    return () => releaseWakeLock();
  }, []);

  // ---------------------------------------------------------------------------
  // Current item
  // ---------------------------------------------------------------------------

  const currentItem: SessionItem | undefined = queue[index];

  // Reset the "disabled" flag any time the cursor advances so the new slide
  // responds to user input immediately.
  useEffect(() => {
    setSlideDisabled(false);
    transitioningRef.current = false;
    setSlideKey((k) => k + 1);
  }, [index, queue]);

  // Record new-word-start for the session stats.
  useEffect(() => {
    if (!currentItem) return;
    if (currentItem.kind === "new_fresh" && currentItem.scenarioIndex === 0) {
      recordNewWordStart(currentItem.word.id);
    }
  }, [currentItem, recordNewWordStart]);

  // ---------------------------------------------------------------------------
  // Advance helpers
  // ---------------------------------------------------------------------------

  const advanceAfter = useCallback(
    (delayMs: number) => {
      if (transitioningRef.current) return;
      transitioningRef.current = true;
      setSlideDisabled(true);
      if (delayMs <= 0) {
        advance();
        return;
      }
      window.setTimeout(() => {
        advance();
      }, delayMs);
    },
    [advance],
  );

  // ---------------------------------------------------------------------------
  // Slide callbacks
  // ---------------------------------------------------------------------------

  const handleExposureDone = useCallback(async () => {
    if (!activeProfile?.id || !currentItem) return;
    if (transitioningRef.current) return;

    // Tier 1 should never fall through here while paused.
    if (paused) return;

    // Claim the transition slot atomically *before* any await so concurrent
    // callers (skip button + useAutoCarousel + any lingering timer) can't all
    // race past the guard during the async completeExposure below.
    transitioningRef.current = true;
    setSlideDisabled(true);

    // Tier 1 only applies to the new_fresh/new_drip kinds (reviews are
    // tier-5 and go through submitReview).
    if (currentItem.kind === "review") {
      advance();
      return;
    }

    // Pull the seenInSession set from the store so dedupe state sticks around.
    const seen = useStudyStore.getState().seenInSession;
    try {
      const { learningEvent } = await progressService.completeExposure(
        activeProfile.id,
        currentItem,
        seen,
      );
      markSeen(`${currentItem.word.id}:${currentItem.scenarioIndex}`);
      await handleLearningEvent(activeProfile.id, learningEvent);
    } catch (err) {
      console.error("[StudyScreen] completeExposure failed:", err);
    }
    advance();
  }, [activeProfile, currentItem, paused, advance, markSeen]);

  const handleSubmit = useCallback(
    async (correct: boolean, latencyMs: number) => {
      if (!activeProfile?.id || !currentItem) return;
      if (transitioningRef.current) return;

      // On a correct answer we're going to advance; claim the transition slot
      // atomically before any await so concurrent callers can't race past.
      // Wrong answers stay on the same slide, so we don't set the ref.
      if (correct) {
        transitioningRef.current = true;
        setSlideDisabled(true);
        recordCorrect();
      } else {
        recordWrong();
      }

      try {
        if (currentItem.kind === "review") {
          const { learningEvent } = await progressService.submitReview(
            activeProfile.id,
            currentItem,
            correct,
            latencyMs,
          );
          await handleLearningEvent(activeProfile.id, learningEvent);
          if (correct) recordReviewCompleted();
        } else {
          const { learningEvent, graduated } =
            await progressService.submitCheck(
              activeProfile.id,
              currentItem,
              correct,
              latencyMs,
            );
          await handleLearningEvent(activeProfile.id, learningEvent);
          if (graduated) recordGraduated();
        }
      } catch (err) {
        console.error("[StudyScreen] submit failed:", err);
      }

      // Correct → advance after a beat so the banner has a chance to show.
      // Wrong → the slide owns its own retry UI; learning event already gave
      // the pet its grumpy reaction.
      if (correct) {
        window.setTimeout(() => {
          advance();
        }, CORRECT_ADVANCE_DELAY_MS);
      }
    },
    [
      activeProfile,
      currentItem,
      advance,
      recordCorrect,
      recordWrong,
      recordGraduated,
      recordReviewCompleted,
    ],
  );

  // ---------------------------------------------------------------------------
  // Auto-carousel (Tier 1 only — with ambient-mode extension to Tier 2-4)
  // ---------------------------------------------------------------------------

  const isTier1 =
    !!currentItem && currentItem.scenario.tier === 1 && currentItem.kind !== "review";
  const ambient = !!effectiveSettings?.ambientMode;

  const tier1Duration = useMemo(() => {
    if (!effectiveSettings) return DEFAULT_TIER1_MS;
    return CAROUSEL_SPEED_MS[effectiveSettings.carouselSpeed] ?? DEFAULT_TIER1_MS;
  }, [effectiveSettings]);

  const autoActive =
    !paused &&
    !slideDisabled &&
    !!currentItem &&
    status === "ready" &&
    (isTier1 ? true : ambient);

  const autoDuration = isTier1 ? tier1Duration : AMBIENT_SKIP_MS;

  const onAutoExpire = useCallback(() => {
    if (!currentItem) return;
    if (transitioningRef.current) return;
    // Tier 1 → treat as "watched to completion".
    if (isTier1) {
      void handleExposureDone();
    } else {
      // Ambient skip — don't count as correct/wrong, just move on.
      advanceAfter(0);
    }
  }, [currentItem, isTier1, handleExposureDone, advanceAfter]);

  useAutoCarousel({
    active: autoActive,
    duration: autoDuration,
    onExpire: onAutoExpire,
    resetToken: index,
  });

  // ---------------------------------------------------------------------------
  // Unlock speech on first interaction
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const handler = () => {
      unlockAudio();
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
    window.addEventListener("pointerdown", handler, { once: false });
    window.addEventListener("keydown", handler, { once: false });
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
  }, [unlockAudio]);

  // ---------------------------------------------------------------------------
  // Clear reward after a beat so the UI can re-trigger on the next event.
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!lastReward) return;
    const t = window.setTimeout(() => {
      clearLastReward();
    }, 1500);
    return () => window.clearTimeout(t);
  }, [lastReward, clearLastReward]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!activeProfile?.id) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-slate-500">
        正在检查个人资料...
      </div>
    );
  }

  if (status === "loading" || status === "idle") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-slate-500">
        <div className="text-xl">正在准备今天的学习内容...</div>
      </div>
    );
  }

  if (status === "exhausted" || !currentItem) {
    return (
      <div className="flex h-full flex-col">
        <StudyTopBar
          path={path}
          scenarioIndex={0}
          queueIndex={queue.length}
          queueLength={queue.length}
        />
        <SessionCompleteCard
          stats={sessionStats}
          onBack={() => {
            reset();
            navigate("/path", { replace: true });
          }}
          onReplay={() => {
            reset();
            if (activeProfile?.id && path && effectiveSettings) {
              void loadQueue(activeProfile.id, path, effectiveSettings, { reviewOnly, replay: true });
            }
          }}
        />
        <PetCompanion profileId={activeProfile.id} />
      </div>
    );
  }

  const currentTier = currentItem.scenario.tier;
  const scenarioIdxInQueue = currentItem.scenarioIndex;

  return (
    <div className="flex h-full flex-col" style={{ background: "#fafaf7" }}>
      <StudyTopBar
        path={path}
        scenarioIndex={scenarioIdxInQueue}
        queueIndex={index}
        queueLength={queue.length}
        rightSlot={
          <CarouselControls
            paused={paused}
            onTogglePause={() => setPaused((p) => !p)}
            onSkip={
              currentTier === 1
                ? () => {
                    void handleExposureDone();
                  }
                : undefined
            }
          />
        }
      />

      <main className="relative flex-1 overflow-hidden">
        <div key={`slide-${slideKey}`} className="absolute inset-0">
          <ScenarioSlide
            scenario={currentItem.scenario}
            word={currentItem.word}
            onExposureDone={handleExposureDone}
            onSubmit={handleSubmit}
            disabled={slideDisabled || paused}
          />
        </div>

        {/* Corner-right reward flash */}
        {lastReward && lastReward.xp > 0 && (
          <div
            className="pointer-events-none absolute bottom-24 right-6 z-30"
            key={`xp-${lastReward.nonce}`}
          >
            <XpGainToast xp={lastReward.xp} />
          </div>
        )}
        {lastReward && (
          <div
            className="pointer-events-none absolute bottom-40 right-6 z-30"
            key={`react-${lastReward.nonce}`}
          >
            <PetReaction reaction={lastReward.reaction} />
          </div>
        )}
        {lastReward?.stageChanged && (
          <div className="pointer-events-none absolute inset-x-0 top-4 z-30 flex justify-center">
            <div className="rounded-full bg-pink-100 px-4 py-1 text-sm font-semibold text-pink-700 shadow">
              🎉 宠物升阶了!
            </div>
          </div>
        )}
        {lastReward && (lastReward.skillsUnlocked?.length ?? 0) > 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-12 z-30 flex justify-center">
            <div className="rounded-full bg-amber-100 px-4 py-1 text-sm font-semibold text-amber-700 shadow">
              ✨ 解锁新技能: {lastReward.skillsUnlocked?.map((s) => s.name).join("、")}
            </div>
          </div>
        )}
      </main>

      <PetCompanion profileId={activeProfile.id} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session-complete card
// ---------------------------------------------------------------------------

interface SessionCompleteCardProps {
  stats: ReturnType<typeof useStudyStore.getState>["sessionStats"];
  onBack: () => void;
  onReplay: () => void;
}

function SessionCompleteCard({ stats, onBack, onReplay }: SessionCompleteCardProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <div className="text-5xl">🎉</div>
      <h2 className="text-3xl font-bold text-slate-800">今天的学习完成啦!</h2>
      <div className="grid max-w-md grid-cols-2 gap-4 text-center">
        <StatChip label="答对" value={stats.correct} color="text-emerald-600" />
        <StatChip label="答错" value={stats.wrong} color="text-rose-500" />
        <StatChip
          label="新学词"
          value={stats.newWordsStarted}
          color="text-indigo-600"
        />
        <StatChip
          label="毕业词"
          value={stats.graduated}
          color="text-amber-600"
        />
        <StatChip
          label="复习词"
          value={stats.reviewsCompleted}
          color="text-cyan-600"
        />
        <StatChip
          label="累计 XP"
          value={stats.xpGained}
          color="text-yellow-600"
        />
      </div>
      <div className="mt-4 flex gap-4">
        <button
          type="button"
          onClick={onReplay}
          className="min-h-14 rounded-2xl bg-indigo-500 px-8 py-3 text-lg font-semibold text-white shadow-lg shadow-indigo-200 hover:bg-indigo-600 active:scale-95"
        >
          再学一次
        </button>
        <button
          type="button"
          onClick={onBack}
          className="min-h-14 rounded-2xl border-2 border-slate-300 bg-white px-8 py-3 text-lg font-semibold text-slate-600 hover:bg-slate-50 active:scale-95"
        >
          返回
        </button>
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
