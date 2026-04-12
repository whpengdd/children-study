// src/types/pet.ts
//
// Tamagotchi-style incentive layer. Strictly one-way coupled to learning:
// petService reads LearningRewardEvent from progressService and NEVER feeds
// back into word state. See plan §宠物激励层.

export type PetStage = "egg" | "baby" | "child" | "teen" | "adult";
export type PetSpecies = "cat" | "dog" | "dragon" | "owl" | "rabbit";

export interface PetStats {
  /** 0–100. Low = "hungry" facial expression; never blocks learning. */
  hunger: number;
  /** 0–100. */
  happiness: number;
  /** 0–100. */
  energy: number;
  /** Monotonic-increasing XP accumulator; drives stage progression. */
  knowledgeXp: number;
}

export interface PetSkill {
  /** Stable identifier, e.g. "alphabet_song". */
  id: string;
  /** Display name, e.g. "字母歌". */
  name: string;
  /** How many graduated words are required to unlock. */
  unlockAt: number;
  kind: "song" | "dance" | "trick" | "story";
  /** ISO timestamp; unset until unlocked. */
  unlockedAt?: string;
}

export interface Pet {
  profileId: number;
  species: PetSpecies;
  /** Name the child chooses in HatchCeremony. */
  name: string;
  stage: PetStage;
  stats: PetStats;
  /** All skills the child has earned so far. Locked skills stay on the Catalog. */
  skills: PetSkill[];
  hatchedAt: string;
  lastFedAt: string;
  lastShowAt: string;
}

/**
 * Append-only growth log. Used for audit (the parent can review what the AI
 * Show said) and for offline animations that want to replay history.
 */
export interface PetEvent {
  /** Dexie auto-increment primary key. */
  id?: number;
  profileId: number;
  ts: string;
  kind: "feed" | "evolve" | "unlock_skill" | "show" | "stat_decay";
  payload: Record<string, unknown>;
}

export interface PetRewardResult {
  xpGained: number;
  stageChanged: boolean;
  skillsUnlocked: PetSkill[];
}
