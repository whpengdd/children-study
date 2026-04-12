// src/types/path.ts
//
// A Profile picks exactly one of these at a time. queueBuilder uses it as a
// catalog filter only; the underlying word progress is shared across paths.

import type { Exam, PepGrade } from "./vocab";

export type LearningPath =
  | { kind: "pep";  grade: PepGrade }
  | { kind: "exam"; exam: Exam };
