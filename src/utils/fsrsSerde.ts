// src/utils/fsrsSerde.ts
//
// Round-trip a ts-fsrs `Card` to/from the `SerializableCard` shape declared in
// src/types/progress.ts. ts-fsrs stores `due` / `last_review` as Date objects;
// Dexie can handle that but JSON fallback (and our unit-test fixtures) can't,
// so we pin the shape to primitives and convert at the boundary only.

import type { Card } from "ts-fsrs";
import { State } from "ts-fsrs";

import type { SerializableCard } from "../types/progress";

/** Card → SerializableCard: drop Date objects into epoch ms. */
export function cardToStorable(card: Card): SerializableCard {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as number,
    last_review:
      card.last_review !== undefined ? card.last_review.getTime() : undefined,
  };
}

/** SerializableCard → Card: reconstruct Date fields + narrow `state`. */
export function cardFromStorable(s: SerializableCard): Card {
  const card: Card = {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsed_days,
    scheduled_days: s.scheduled_days,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state as State,
  };
  if (s.last_review !== undefined) {
    card.last_review = new Date(s.last_review);
  }
  return card;
}
