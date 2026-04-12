// src/screens/Study/CarouselControls.tsx
//
// Pause/resume + optional skip/previous. StudyScreen owns the paused state
// and just renders this as a small pill of buttons. Skip and previous are
// optional because Tier 2-4 slides don't want them (the child must actually
// answer).

export interface CarouselControlsProps {
  paused: boolean;
  onTogglePause: () => void;
  /** Skip is a no-judgement advance. Visible in Tier 1 slides only. */
  onSkip?: () => void;
  /** Optional previous. Usually hidden — reviews/checks don't rewind. */
  onPrevious?: () => void;
}

export default function CarouselControls({
  paused,
  onTogglePause,
  onSkip,
  onPrevious,
}: CarouselControlsProps): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      {onPrevious && (
        <button
          type="button"
          onClick={onPrevious}
          aria-label="Previous"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-600 hover:bg-slate-200 active:scale-95"
        >
          ◀
        </button>
      )}
      <button
        type="button"
        onClick={onTogglePause}
        aria-label={paused ? "Resume" : "Pause"}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-700 hover:bg-slate-200 active:scale-95"
      >
        {paused ? "▶" : "⏸"}
      </button>
      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          aria-label="Skip"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-600 hover:bg-slate-200 active:scale-95"
        >
          ▶▶
        </button>
      )}
    </div>
  );
}
