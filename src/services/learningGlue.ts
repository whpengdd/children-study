// src/services/learningGlue.ts
//
// One-way coupling from progressService → petService, plus store updates.
// StudyScreen / ReviewScreen call this after every state-machine transition
// emitted by progressService; we forward the LearningRewardEvent to petService,
// update the pet store with the result, and publish a lastReward onto the
// study store so the UI can flash XpGainToast + PetReaction.
//
// This file is intentionally thin — all real logic lives in the pure layers.

import * as petService from "../services/petService";
import { usePetStore } from "../store/usePetStore";
import { useStudyStore } from "../store/useStudyStore";
import type {
  LearningRewardEvent,
  PetRewardResult,
} from "../types";

export interface HandleLearningEventReturn {
  /** Pet reward result, or `undefined` if the event was falsy. */
  result?: PetRewardResult;
}

/**
 * Forward a LearningRewardEvent to petService and publish store updates.
 * Silently no-ops when `learningEvent` is `undefined` (this happens on
 * idempotent exposures where the caller already saw the card).
 */
export async function handleLearningEvent(
  profileId: number,
  learningEvent: LearningRewardEvent | undefined,
): Promise<HandleLearningEventReturn> {
  if (!learningEvent) return {};

  let result: PetRewardResult | undefined;
  try {
    result = await petService.rewardFromLearning(profileId, learningEvent);
  } catch (err) {
    console.error("[learningGlue] rewardFromLearning failed:", err);
    return {};
  }

  // Push into the pet store for PetCompanion to animate, and bookkeep
  // the session stats.
  usePetStore.getState().handleRewardResult(result);
  await usePetStore.getState().refreshPet(profileId);

  const study = useStudyStore.getState();
  study.recordXpGained(result.xpGained);

  const isWrong = learningEvent.kind.includes("wrong");
  const celebrate =
    result.stageChanged || result.skillsUnlocked.length > 0 ||
    (learningEvent.kind === "tier4_correct" && learningEvent.graduated);

  study.setLastReward({
    xp: result.xpGained,
    reaction: celebrate ? "celebrate" : isWrong ? "wrong" : "correct",
    skillsUnlocked: result.skillsUnlocked,
    stageChanged: result.stageChanged,
  });

  return { result };
}
