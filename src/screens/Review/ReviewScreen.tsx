// src/screens/Review/ReviewScreen.tsx
//
// Thin wrapper around StudyScreen that forces `reviewOnly: true`. Reuses the
// whole session flow (top bar, pet companion, wake lock, etc.) — the queue
// builder filter is applied by useStudyStore when the prop is passed through.

import StudyScreen from "../Study/StudyScreen";

export default function ReviewScreen() {
  return <StudyScreen reviewOnly />;
}
