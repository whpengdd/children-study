// src/screens/Study/ScenarioSlide.tsx
//
// Dispatcher that routes a `Scenario` to the right slide component. Uses an
// exhaustive switch on `scenario.kind` so TypeScript flags any missing case
// when the Scenario union grows. Tier 1 slides call `onExposureDone`; Tier 2-4
// slides call `onSubmit(correct, latencyMs)`.

import type { Scenario, Word } from "../../types";

import SentenceSlide from "./slides/SentenceSlide";
import DialogSlide from "./slides/DialogSlide";
import ImageSlide from "./slides/ImageSlide";
import ChantSlide from "./slides/ChantSlide";
import ListenChooseSlide from "./slides/ListenChooseSlide";
import EnToCnMcqSlide from "./slides/EnToCnMcqSlide";
import CnToEnMcqSlide from "./slides/CnToEnMcqSlide";
import FillBlankSlide from "./slides/FillBlankSlide";
import WordFormationSlide from "./slides/WordFormationSlide";
import SpellSlide from "./slides/SpellSlide";

export interface ScenarioSlideProps {
  scenario: Scenario;
  word: Word;
  onSubmit: (correct: boolean, latencyMs: number) => void;
  onExposureDone: () => void;
  disabled?: boolean;
}

export default function ScenarioSlide(props: ScenarioSlideProps) {
  const { scenario, word, onSubmit, onExposureDone, disabled } = props;

  switch (scenario.kind) {
    // Tier 1 — passive exposure
    case "sentence":
      return (
        <SentenceSlide
          scenario={scenario}
          word={word}
          onExposureDone={onExposureDone}
          disabled={disabled}
        />
      );
    case "dialog":
      return (
        <DialogSlide
          scenario={scenario}
          word={word}
          onExposureDone={onExposureDone}
          disabled={disabled}
        />
      );
    case "image":
      return (
        <ImageSlide
          scenario={scenario}
          word={word}
          onExposureDone={onExposureDone}
          disabled={disabled}
        />
      );
    case "chant":
      return (
        <ChantSlide
          scenario={scenario}
          word={word}
          onExposureDone={onExposureDone}
          disabled={disabled}
        />
      );

    // Tier 2 — recognition
    case "listen_choose":
      return (
        <ListenChooseSlide
          scenario={scenario}
          word={word}
          onSubmit={onSubmit}
          disabled={disabled}
        />
      );
    case "en_to_cn_mcq":
      return (
        <EnToCnMcqSlide
          scenario={scenario}
          word={word}
          onSubmit={onSubmit}
          disabled={disabled}
        />
      );

    // Tier 3 — production
    case "cn_to_en_mcq":
      return (
        <CnToEnMcqSlide
          scenario={scenario}
          word={word}
          onSubmit={onSubmit}
          disabled={disabled}
        />
      );
    case "fill_blank_choose":
      return (
        <FillBlankSlide
          scenario={scenario}
          word={word}
          onSubmit={onSubmit}
          disabled={disabled}
        />
      );
    case "word_formation":
      return (
        <WordFormationSlide
          scenario={scenario}
          word={word}
          onSubmit={onSubmit}
          disabled={disabled}
        />
      );

    // Tier 4 — mastery (single slide handles both spell kinds via union)
    case "spell_from_audio":
    case "spell_from_cn":
      return (
        <SpellSlide
          scenario={scenario}
          word={word}
          onSubmit={onSubmit}
          disabled={disabled}
        />
      );

    default: {
      // Exhaustiveness guard — if a new kind is added to the Scenario union,
      // TypeScript will fail to narrow this to `never` and the build breaks.
      const _exhaustive: never = scenario;
      return (
        <div className="flex h-full items-center justify-center text-rose-600">
          Unknown scenario kind: {JSON.stringify(_exhaustive)}
        </div>
      );
    }
  }
}
