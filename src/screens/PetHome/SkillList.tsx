// src/screens/PetHome/SkillList.tsx
//
// Grid of skill cards. Each card is either:
//   - "unlocked"  -> full color, tappable, "开始表演" button navigates to /show/:skillId
//   - "locked"    -> grayed out, lock icon, "再学 N 词解锁" / "{{stage}} 阶段解锁" hint
//
// Data source: `SKILL_CATALOG` from petService (the single source of truth
// for every possible skill) plus the pet's own `pet.skills` array (which
// skills the child has actually earned). We never mutate anything here.

import { SKILL_CATALOG } from "../../services/petService";
import type { Pet, PetStage } from "../../types";

export interface SkillListProps {
  pet: Pet;
  /** Current graduated-word count (tier === 5). */
  graduatedCount: number;
  /** Called when the child taps an unlocked skill card. */
  onSkillTap: (skillId: string) => void;
}

// ---------------------------------------------------------------------------
// Cosmetic lookup tables
// ---------------------------------------------------------------------------

/** Emoji icon per skill. Cheap, no asset pipeline needed. */
const SKILL_ICON: Record<string, string> = {
  alphabet_song: "🎤",
  count_1_10: "🔢",
  color_dance: "🌈",
  animal_parade: "🦁",
  storytelling_basic: "📖",
  ket_warmup_quiz: "🧠",
  story_personalized: "✨",
};

const STAGE_LABEL: Record<PetStage, string> = {
  egg: "蛋",
  baby: "幼儿",
  child: "儿童",
  teen: "少年",
  adult: "成年",
};

const STAGE_ORDER: PetStage[] = ["egg", "baby", "child", "teen", "adult"];

function stageAtLeast(current: PetStage, required: PetStage): boolean {
  return STAGE_ORDER.indexOf(current) >= STAGE_ORDER.indexOf(required);
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

interface SkillCardProps {
  skillId: string;
  name: string;
  kind: string;
  icon: string;
  unlocked: boolean;
  /** Locked hint (only used when `unlocked` is false). */
  lockHint?: string;
  onTap?: () => void;
}

function SkillCard({
  skillId,
  name,
  kind,
  icon,
  unlocked,
  lockHint,
  onTap,
}: SkillCardProps): JSX.Element {
  if (unlocked) {
    return (
      <button
        type="button"
        onClick={onTap}
        className="
          relative flex flex-col items-center justify-between
          gap-2 rounded-2xl bg-gradient-to-br from-amber-100 via-pink-100 to-sky-100
          p-3 text-slate-800 shadow-sm ring-1 ring-amber-200
          hover:scale-[1.03] hover:shadow-md transition
          focus:outline-none focus:ring-2 focus:ring-amber-400
        "
        aria-label={`开始表演 ${name}`}
      >
        <span aria-hidden className="text-4xl leading-none">
          {icon}
        </span>
        <span className="text-sm font-semibold text-slate-800 truncate w-full text-center">
          {name}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-slate-500">
          {kind}
        </span>
        <span className="mt-1 inline-block rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white shadow">
          开始表演
        </span>
      </button>
    );
  }

  return (
    <div
      className="
        relative flex flex-col items-center justify-between
        gap-2 rounded-2xl bg-slate-100 p-3 text-slate-400
        ring-1 ring-slate-200 select-none opacity-80
      "
      aria-label={`${name} 尚未解锁：${lockHint ?? ""}`}
      title={lockHint}
    >
      <span aria-hidden className="text-4xl grayscale leading-none">
        {icon}
      </span>
      <span className="text-sm font-semibold truncate w-full text-center">
        {name}
      </span>
      <span className="text-[10px] uppercase tracking-wider">{kind}</span>
      <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-500">
        <span aria-hidden>🔒</span>
        <span className="truncate max-w-[8rem]">{lockHint ?? "未解锁"}</span>
      </span>
      {/* Hidden id for e2e / dev checks */}
      <span className="sr-only">{skillId}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SkillList
// ---------------------------------------------------------------------------

export function SkillList({
  pet,
  graduatedCount,
  onSkillTap,
}: SkillListProps): JSX.Element {
  const ownedIds = new Set(pet.skills.map((s) => s.id));

  const cards = SKILL_CATALOG.map((entry) => {
    const unlocked = ownedIds.has(entry.id);
    const icon = SKILL_ICON[entry.id] ?? "⭐";

    // Compute a friendly unlock hint.
    let lockHint: string | undefined;
    if (!unlocked) {
      const hints: string[] = [];
      if (entry.stageRequired && !stageAtLeast(pet.stage, entry.stageRequired)) {
        hints.push(`${STAGE_LABEL[entry.stageRequired]} 阶段`);
      }
      const needed = entry.unlockAt - graduatedCount;
      if (needed > 0) {
        hints.push(`再学 ${needed} 词`);
      } else if (pet.stage === "egg") {
        // Egg-stage pets never have skills (petService guarantee).
        hints.push("孵化后解锁");
      }
      lockHint = hints.length > 0 ? hints.join(" · ") : "即将解锁";
    }

    return (
      <SkillCard
        key={entry.id}
        skillId={entry.id}
        name={entry.name}
        kind={entry.kind}
        icon={icon}
        unlocked={unlocked}
        lockHint={lockHint}
        onTap={unlocked ? () => onSkillTap(entry.id) : undefined}
      />
    );
  });

  return (
    <div className="w-full">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {cards}
      </div>
    </div>
  );
}

export default SkillList;
