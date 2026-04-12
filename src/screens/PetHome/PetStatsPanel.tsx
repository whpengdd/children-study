// src/screens/PetHome/PetStatsPanel.tsx
//
// Renders the 4 horizontal "vital" bars for the pet (hunger / happiness /
// energy / knowledge XP) plus a little "distance to next stage" hint.
//
// Pure presentation: it reads everything it needs from the props and never
// touches Dexie or petService directly. The parent (PetHomeScreen) is
// responsible for loading the pet and counting graduations.

import type { Pet, PetStage } from "../../types";

export interface PetStatsPanelProps {
  pet: Pet;
  /** Number of tier-5 graduated words for this profile. */
  graduatedCount: number;
}

// ---------------------------------------------------------------------------
// Next-stage thresholds mirror petService.computeStage.
// ---------------------------------------------------------------------------

interface StageTarget {
  stage: PetStage;
  xp: number;
  graduated: number;
}

/** Returns the next stage target, or null when the pet is already adult. */
function nextStageTarget(pet: Pet): StageTarget | null {
  switch (pet.stage) {
    case "egg":
      return { stage: "baby", xp: 30, graduated: 0 };
    case "baby":
      return { stage: "child", xp: 150, graduated: 10 };
    case "child":
      return { stage: "teen", xp: 500, graduated: 50 };
    case "teen":
      return { stage: "adult", xp: 2000, graduated: 200 };
    case "adult":
    default:
      return null;
  }
}

const STAGE_LABEL: Record<PetStage, string> = {
  egg: "蛋",
  baby: "幼儿",
  child: "儿童",
  teen: "少年",
  adult: "成年",
};

// ---------------------------------------------------------------------------
// Single-bar helper
// ---------------------------------------------------------------------------

interface StatBarProps {
  /** Emoji + label. */
  icon: string;
  label: string;
  /** 0-100 for vitals; for XP this is pre-computed as a percentage. */
  percent: number;
  /** Raw display text on the right side (e.g. "82 / 100"). */
  right: string;
  /** Tailwind bg-* color class for the fill. */
  color: string;
}

function StatBar({ icon, label, percent, right, color }: StatBarProps): JSX.Element {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-sm text-slate-700 mb-1">
        <span className="flex items-center gap-1.5 font-medium">
          <span aria-hidden>{icon}</span>
          <span>{label}</span>
        </span>
        <span className="tabular-nums text-slate-500 text-xs">{right}</span>
      </div>
      <div
        className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
      >
        <div
          className={`h-full ${color} transition-all duration-500 ease-out rounded-full`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PetStatsPanel
// ---------------------------------------------------------------------------

export function PetStatsPanel({
  pet,
  graduatedCount,
}: PetStatsPanelProps): JSX.Element {
  const { hunger, happiness, energy, knowledgeXp } = pet.stats;
  const target = nextStageTarget(pet);

  // XP progress: compute "into this stage" so the bar always grows from 0 to
  // the next threshold, not from the very beginning.
  const previousThresholdXp = (() => {
    switch (pet.stage) {
      case "egg":
        return 0;
      case "baby":
        return 30;
      case "child":
        return 150;
      case "teen":
        return 500;
      case "adult":
        return 2000;
    }
  })();

  const xpPercent = (() => {
    if (!target) return 100;
    const span = target.xp - previousThresholdXp;
    if (span <= 0) return 100;
    const progress = knowledgeXp - previousThresholdXp;
    return Math.max(0, Math.min(100, (progress / span) * 100));
  })();

  const xpRightText = target
    ? `${knowledgeXp} / ${target.xp} XP`
    : `${knowledgeXp} XP`;

  // "Distance to next stage" hint below the bars.
  const distanceHint = (() => {
    if (!target) return "已达到最高阶段 🎉";
    const xpNeeded = Math.max(0, target.xp - knowledgeXp);
    const gradNeeded = Math.max(0, target.graduated - graduatedCount);
    const parts: string[] = [];
    if (xpNeeded > 0) parts.push(`${xpNeeded} XP`);
    if (gradNeeded > 0) parts.push(`${gradNeeded} 个毕业词`);
    if (parts.length === 0) return `下次学习就能升到 ${STAGE_LABEL[target.stage]} 啦！`;
    return `距离「${STAGE_LABEL[target.stage]}」还需 ${parts.join(" 和 ")}`;
  })();

  return (
    <div className="w-full max-w-md mx-auto flex flex-col gap-3">
      <StatBar
        icon="🍖"
        label="饥饿"
        percent={hunger}
        right={`${hunger} / 100`}
        color="bg-orange-400"
      />
      <StatBar
        icon="😊"
        label="快乐"
        percent={happiness}
        right={`${happiness} / 100`}
        color="bg-pink-400"
      />
      <StatBar
        icon="⚡"
        label="能量"
        percent={energy}
        right={`${energy} / 100`}
        color="bg-yellow-400"
      />
      <StatBar
        icon="📚"
        label="经验值"
        percent={xpPercent}
        right={xpRightText}
        color="bg-indigo-500"
      />
      <p className="text-xs text-slate-500 text-center mt-1">
        {distanceHint}
      </p>
    </div>
  );
}

export default PetStatsPanel;
