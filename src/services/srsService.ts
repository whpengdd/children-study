// src/services/srsService.ts
//
// Thin wrapper around ts-fsrs. Keeps a single `scheduler` singleton so every
// call site shares the same FSRS parameters, and offers a small surface area
// that the rest of the app actually uses:
//   - initialCard()  → brand new Card at "now"
//   - rateCard()     → apply a Rating, get { card, log }
//
// We intentionally do NOT do any Dexie I/O here — progressService owns the
// persistence story, this file is 100% pure.

import {
  Rating,
  createEmptyCard,
  fsrs,
  generatorParameters,
  type Card,
  type Grade,
  type RecordLogItem,
  type FSRS,
} from "ts-fsrs";

/** Default FSRS parameters — we accept the library defaults for v1. */
const defaultParams = generatorParameters({
  enable_fuzz: false,
  enable_short_term: true,
});

/** App-wide scheduler singleton. */
export const scheduler: FSRS = fsrs(defaultParams);

export { Rating };
export type { Card, Grade };

/**
 * Returns a fresh `Card` at the current moment. Used by progressService when
 * it first creates a `WordProgress` row so that the card is valid long before
 * the word actually graduates into FSRS (tier 5).
 */
export function initialCard(now: Date = new Date()): Card {
  return createEmptyCard(now);
}

/**
 * Apply a rating to a card and return the ts-fsrs result: the next Card and
 * the review log for auditability. Thin pass-through so upstream code doesn't
 * need to import the scheduler directly.
 */
export function rateCard(
  card: Card,
  rating: Grade,
  now: Date = new Date(),
): RecordLogItem {
  return scheduler.next(card, now, rating);
}
