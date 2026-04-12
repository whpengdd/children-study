// src/screens/Stats/StatsScreen.tsx
//
// Minimal stats dashboard for v1:
//   - Path progress rings (PEP 3/4/5/6/KET/PET)
//   - Total graduated today / this week
//   - Session count this week
//   - Top 10 易错词 from checkAttempts
//   - Streak (consecutive days with any wordProgress activity)
//
// All data aggregation is inline; no service-layer helpers added.

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import ProfileBadge from "../../components/ProfileBadge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { db } from "../../data/db";
import { loadCatalog, loadIndex } from "../../data/vocabLoader";
import { dayjs, localDateString } from "../../utils/date";
import { useProfileStore } from "../../store/useProfileStore";
import type { Exam, PepGrade } from "../../types";

interface PathRingData {
  id: string;
  label: string;
  total: number;
  graduated: number;
  color: string;
}

interface StatsState {
  pathRings: PathRingData[];
  graduatedToday: number;
  graduatedThisWeek: number;
  sessionsThisWeek: number;
  streak: number;
  /** [wordId, headword, wrongCount] — top 10. */
  toughWords: { wordId: string; headWord: string; wrongCount: number }[];
}

const EMPTY_STATS: StatsState = {
  pathRings: [],
  graduatedToday: 0,
  graduatedThisWeek: 0,
  sessionsThisWeek: 0,
  streak: 0,
  toughWords: [],
};

const PEP_GRADES: PepGrade[] = [3, 4, 5, 6];
const EXAMS: Exam[] = ["KET", "PET"];

async function loadAllStats(profileId: number): Promise<StatsState> {
  // --- Path rings ---
  const indexesPromise = Promise.all([
    ...PEP_GRADES.map((g) =>
      loadIndex("pep-grade", g).then((ids) => ({
        id: `pep-${g}`,
        label: `PEP${g}`,
        ids,
        color: pepColor(g),
      })),
    ),
    ...EXAMS.map((e) =>
      loadIndex("exam", e).then((ids) => ({
        id: `exam-${e}`,
        label: e,
        ids,
        color: examColor(e),
      })),
    ),
  ]);

  const graduatedRowsPromise = db.wordProgress
    .where("[profileId+tier]")
    .equals([profileId, 5])
    .toArray()
    .catch(() => []);

  const allProgressRowsPromise = db.wordProgress
    .where({ profileId })
    .toArray()
    .catch(() => []);

  const sessionsPromise = db.sessionHistory
    .where({ profileId })
    .toArray()
    .catch(() => []);

  const attemptsPromise = db.checkAttempts
    .where({ profileId })
    .toArray()
    .catch(() => []);

  const [indexes, graduatedRows, allProgressRows, sessions, attempts] = await Promise.all([
    indexesPromise,
    graduatedRowsPromise,
    allProgressRowsPromise,
    sessionsPromise,
    attemptsPromise,
  ]);

  const graduatedIds = new Set(graduatedRows.map((r) => r.wordId));
  const pathRings: PathRingData[] = indexes.map(({ id, label, ids, color }) => ({
    id,
    label,
    total: ids.length,
    graduated: ids.reduce((acc, wid) => acc + (graduatedIds.has(wid) ? 1 : 0), 0),
    color,
  }));

  // --- Graduated today / this week (by progressService.lastAdvancedAt on tier 5 rows) ---
  const todayStr = localDateString();
  const weekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let graduatedToday = 0;
  let graduatedThisWeek = 0;
  for (const row of graduatedRows) {
    const advancedAt = row.lastAdvancedAt ? Date.parse(row.lastAdvancedAt) : 0;
    if (!Number.isFinite(advancedAt) || advancedAt <= 0) continue;
    if (localDateString(advancedAt) === todayStr) graduatedToday++;
    if (advancedAt >= weekAgoMs) graduatedThisWeek++;
  }

  // --- Sessions this week ---
  const sessionsThisWeek = sessions.filter(
    (s) => s.startedAt && Date.parse(s.startedAt) >= weekAgoMs,
  ).length;

  // --- Streak: consecutive calendar days with any wordProgress.lastSeenAt activity. ---
  const activeDays = new Set<string>();
  for (const row of allProgressRows) {
    if (!row.lastSeenAt) continue;
    const ms = Date.parse(row.lastSeenAt);
    if (!Number.isFinite(ms) || ms <= 0) continue;
    activeDays.add(localDateString(ms));
  }
  let streak = 0;
  for (let i = 0; i < 3650; i++) {
    const day = localDateString(Date.now() - i * 24 * 60 * 60 * 1000);
    if (activeDays.has(day)) streak++;
    else if (i === 0) continue; // still counts if no activity today; start counting from yesterday
    else break;
  }
  // If the first day we looked at (today) had no activity, we intentionally
  // let the loop keep searching; but the loop above exits as soon as the day
  // after the start has no activity. Clamp.
  if (streak > 3650) streak = 0;

  // --- Tough words (top 10 by wrong count) ---
  const wrongByWord = new Map<string, number>();
  for (const a of attempts) {
    if (!a.correct) {
      wrongByWord.set(a.wordId, (wrongByWord.get(a.wordId) ?? 0) + 1);
    }
  }
  const toughEntries = Array.from(wrongByWord.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  // Look up headwords — but only if we have any entries, to avoid a full catalog fetch for nothing.
  const toughWords: StatsState["toughWords"] = [];
  if (toughEntries.length > 0) {
    try {
      const catalog = await loadCatalog();
      const byId = new Map(catalog.words.map((w) => [w.id, w.headWord]));
      for (const [wordId, wrongCount] of toughEntries) {
        toughWords.push({
          wordId,
          headWord: byId.get(wordId) ?? wordId,
          wrongCount,
        });
      }
    } catch {
      for (const [wordId, wrongCount] of toughEntries) {
        toughWords.push({ wordId, headWord: wordId, wrongCount });
      }
    }
  }

  return {
    pathRings,
    graduatedToday,
    graduatedThisWeek,
    sessionsThisWeek,
    streak,
    toughWords,
  };
}

function pepColor(g: PepGrade): string {
  switch (g) {
    case 3:
      return "#10b981"; // emerald-500
    case 4:
      return "#0ea5e9"; // sky-500
    case 5:
      return "#f59e0b"; // amber-500
    case 6:
      return "#f43f5e"; // rose-500
  }
}
function examColor(e: Exam): string {
  return e === "KET" ? "#4f46e5" /* indigo-600 */ : "#c026d3" /* fuchsia-600 */;
}

function Ring({
  label,
  total,
  graduated,
  color,
}: PathRingData) {
  const pct = total > 0 ? Math.min(1, graduated / total) : 0;
  const size = 80;
  const radius = 32;
  const circ = 2 * Math.PI * radius;
  const dash = circ * pct;
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={8}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="50%"
          dominantBaseline="middle"
          textAnchor="middle"
          fontSize={14}
          fill="#374151"
          fontWeight="bold"
        >
          {Math.round(pct * 100)}%
        </text>
      </svg>
      <div className="mt-1 text-sm font-medium text-gray-800">{label}</div>
      <div className="text-xs text-gray-500">
        {graduated} / {total}
      </div>
    </div>
  );
}

export default function StatsScreen() {
  const navigate = useNavigate();
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const loadProfiles = useProfileStore((s) => s.loadProfiles);

  const [stats, setStats] = useState<StatsState>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeProfile) {
      loadProfiles().then(() => {
        const restored = useProfileStore.getState().activeProfile;
        if (!restored) navigate("/", { replace: true });
      });
    }
  }, [activeProfile, loadProfiles, navigate]);

  useEffect(() => {
    if (!activeProfile?.id) return;
    setLoading(true);
    loadAllStats(activeProfile.id)
      .then((s) => {
        setStats(s);
        setLoading(false);
      })
      .catch((err) => {
        console.warn("[Stats] loadAllStats failed:", err);
        setLoading(false);
      });
  }, [activeProfile?.id]);

  const todayLabel = useMemo(() => dayjs().format("YYYY年M月D日"), []);

  return (
    <div className="min-h-full bg-gradient-to-b from-white to-emerald-50">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-full bg-white p-2 shadow-sm border border-gray-200 hover:bg-gray-50"
              aria-label="返回"
            >
              ←
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">学习数据</h1>
              <p className="text-xs text-gray-500">{todayLabel}</p>
            </div>
          </div>
          <ProfileBadge profile={activeProfile} />
        </header>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">加载数据中…</div>
        ) : (
          <>
            <Card className="mb-5">
              <h2 className="mb-3 text-base font-semibold text-gray-800">
                📈 路径进度
              </h2>
              <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
                {stats.pathRings.map((r) => (
                  <Ring key={r.id} {...r} />
                ))}
              </div>
            </Card>

            <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Card>
                <div className="text-xs uppercase tracking-wide text-gray-500">
                  今日掌握
                </div>
                <div className="text-3xl font-bold text-emerald-600">
                  {stats.graduatedToday}
                </div>
              </Card>
              <Card>
                <div className="text-xs uppercase tracking-wide text-gray-500">
                  本周掌握
                </div>
                <div className="text-3xl font-bold text-sky-600">
                  {stats.graduatedThisWeek}
                </div>
              </Card>
              <Card>
                <div className="text-xs uppercase tracking-wide text-gray-500">
                  本周课次
                </div>
                <div className="text-3xl font-bold text-amber-600">
                  {stats.sessionsThisWeek}
                </div>
              </Card>
              <Card>
                <div className="text-xs uppercase tracking-wide text-gray-500">
                  连续天数
                </div>
                <div className="text-3xl font-bold text-rose-600">
                  🔥 {stats.streak}
                </div>
              </Card>
            </div>

            <Card className="mb-10">
              <h2 className="mb-3 text-base font-semibold text-gray-800">
                🧨 易错词 Top 10
              </h2>
              {stats.toughWords.length === 0 ? (
                <div className="py-6 text-center text-sm text-gray-400">
                  还没有错题记录,多学一会儿吧!
                </div>
              ) : (
                <ol className="space-y-1.5">
                  {stats.toughWords.map((w, idx) => (
                    <li
                      key={w.wordId}
                      className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2"
                    >
                      <span className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-gray-500">
                          {idx + 1}.
                        </span>
                        <span className="text-base text-gray-900">
                          {w.headWord}
                        </span>
                      </span>
                      <span className="text-sm text-red-500">
                        错 {w.wrongCount} 次
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <div className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/path")}
              >
                继续学习 →
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
