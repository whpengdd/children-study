// src/screens/PathSelect/PathSelectScreen.tsx
//
// Shown after a profile has been selected. Two sections:
//   - 按课本: PEP 3/4/5/6 cards
//   - 按考试: KET / PET cards
// Plus a bottom row of links to Review / Stats / Settings / Pet.
//
// Progress bars come from a small inline helper that reads
// db.wordProgress (tier === 5 means graduated) intersected with the path
// index loaded from vocabLoader.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import ProfileBadge from "../../components/ProfileBadge";
import { Button } from "../../components/ui/Button";
import { db } from "../../data/db";
import { loadIndex } from "../../data/vocabLoader";
import { useProfileStore } from "../../store/useProfileStore";
import { usePathStore } from "../../store/usePathStore";
import type { Exam, LearningPath, PepGrade } from "../../types";

import ExamCard from "./ExamCard";
import PepGradeCard from "./PepGradeCard";

const PEP_GRADES: PepGrade[] = [3, 4, 5, 6];
const EXAMS: Exam[] = ["KET", "PET"];

interface PathStats {
  // key: "pep-3" / "pep-4" / ... / "exam-KET" / "exam-PET"
  [key: string]: { total: number; graduated: number };
}

function pathKey(path: LearningPath): string {
  return path.kind === "pep" ? `pep-${path.grade}` : `exam-${path.exam}`;
}

/**
 * Inline helper (not in services/ — kept local per scope rules). Reads the
 * per-path word index from vocabLoader and the profile's graduated word count
 * from Dexie. Runs once per mount for a given profile.
 */
async function loadPathStats(profileId: number): Promise<PathStats> {
  const stats: PathStats = {};

  // Load all path indexes in parallel.
  const indexes = await Promise.all([
    ...PEP_GRADES.map((g) => loadIndex("pep-grade", g).then((ids) => ({ key: `pep-${g}`, ids }))),
    ...EXAMS.map((e) => loadIndex("exam", e).then((ids) => ({ key: `exam-${e}`, ids }))),
  ]);

  // Pull ALL graduated (tier === 5) word progress rows for this profile once.
  // Dexie compound index [profileId+tier] → fast.
  let graduatedIds: Set<string>;
  try {
    const rows = await db.wordProgress
      .where("[profileId+tier]")
      .equals([profileId, 5])
      .toArray();
    graduatedIds = new Set(rows.map((r) => r.wordId));
  } catch (err) {
    console.warn("[PathSelect] wordProgress query failed:", err);
    graduatedIds = new Set();
  }

  for (const { key, ids } of indexes) {
    const total = ids.length;
    const graduated = ids.reduce(
      (acc, id) => acc + (graduatedIds.has(id) ? 1 : 0),
      0,
    );
    stats[key] = { total, graduated };
  }

  return stats;
}

export default function PathSelectScreen() {
  const navigate = useNavigate();
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const loadProfiles = useProfileStore((s) => s.loadProfiles);
  const setPathForProfile = usePathStore((s) => s.setPathForProfile);

  const [stats, setStats] = useState<PathStats>({});
  const [loaded, setLoaded] = useState(false);

  // If the component mounted without an active profile (e.g. hard refresh),
  // try to rehydrate from localStorage via loadProfiles.
  useEffect(() => {
    if (!activeProfile) {
      loadProfiles().then(() => {
        const restored = useProfileStore.getState().activeProfile;
        if (!restored) navigate("/", { replace: true });
      });
    }
  }, [activeProfile, loadProfiles, navigate]);

  // Load path stats whenever the active profile changes.
  useEffect(() => {
    if (!activeProfile?.id) return;
    setLoaded(false);
    loadPathStats(activeProfile.id)
      .then((s) => {
        setStats(s);
        setLoaded(true);
      })
      .catch((err) => {
        console.warn("[PathSelect] loadPathStats failed:", err);
        setLoaded(true);
      });
  }, [activeProfile?.id]);

  const handleSelectGrade = async (grade: PepGrade) => {
    if (!activeProfile?.id) return;
    const path: LearningPath = { kind: "pep", grade };
    await setPathForProfile(activeProfile.id, path);
    navigate("/study");
  };

  const handleSelectExam = async (exam: Exam) => {
    if (!activeProfile?.id) return;
    const path: LearningPath = { kind: "exam", exam };
    await setPathForProfile(activeProfile.id, path);
    navigate("/study");
  };

  const getPepStats = useMemo(
    () => (grade: PepGrade) => stats[pathKey({ kind: "pep", grade })] ?? { total: 0, graduated: 0 },
    [stats],
  );
  const getExamStats = useMemo(
    () => (exam: Exam) => stats[pathKey({ kind: "exam", exam })] ?? { total: 0, graduated: 0 },
    [stats],
  );

  return (
    <div className="min-h-full bg-gradient-to-b from-sky-50 via-white to-orange-50">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">今天学点什么?</h1>
            <p className="mt-1 text-sm text-gray-600">挑一本书或一个考试开始吧</p>
          </div>
          <ProfileBadge profile={activeProfile} />
        </header>

        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-gray-800">
            📚 按课本
          </h2>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {PEP_GRADES.map((g) => (
              <PepGradeCard
                key={g}
                grade={g}
                totalWords={getPepStats(g).total}
                graduatedCount={getPepStats(g).graduated}
                onSelect={handleSelectGrade}
              />
            ))}
          </div>
          {!loaded && (
            <p className="mt-3 text-xs text-gray-400">加载单词表中…</p>
          )}
        </section>

        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-gray-800">
            🎓 按考试
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {EXAMS.map((e) => (
              <ExamCard
                key={e}
                exam={e}
                totalWords={getExamStats(e).total}
                graduatedCount={getExamStats(e).graduated}
                onSelect={handleSelectExam}
              />
            ))}
          </div>
        </section>

        <nav className="mt-8 flex flex-wrap justify-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => navigate("/review")}>
            🔁 复习
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate("/stats")}>
            📊 数据
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate("/settings")}>
            ⚙️ 设置
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate("/pet")}>
            🐾 宠物
          </Button>
        </nav>
      </div>
    </div>
  );
}
