// src/screens/Settings/SettingsScreen.tsx
//
// One row per profile in db.settings. Every change goes straight to
// useSettingsStore.updateField which persists to Dexie immediately.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import ProfileBadge from "../../components/ProfileBadge";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Slider } from "../../components/ui/Slider";
import { Toggle } from "../../components/ui/Toggle";
import { db } from "../../data/db";
import { useProfileStore } from "../../store/useProfileStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import type { GenerationMode, Settings } from "../../types";

const CAROUSEL_SPEED_MS: Record<Settings["carouselSpeed"], number> = {
  slow: 6000,
  normal: 4000,
  fast: 2500,
};

const CAROUSEL_SPEED_ORDER: Settings["carouselSpeed"][] = ["slow", "normal", "fast"];

export default function SettingsScreen() {
  const navigate = useNavigate();
  const activeProfile = useProfileStore((s) => s.activeProfile);
  const loadProfiles = useProfileStore((s) => s.loadProfiles);

  const settings = useSettingsStore((s) => s.settings);
  const loadForProfile = useSettingsStore((s) => s.loadForProfile);
  const updateField = useSettingsStore((s) => s.updateField);

  const [confirmReset, setConfirmReset] = useState(false);
  const [exportState, setExportState] = useState<"idle" | "working">("idle");

  // Redirect to ProfileGate if no active profile — user shouldn't be here.
  useEffect(() => {
    if (!activeProfile) {
      loadProfiles().then(() => {
        const restored = useProfileStore.getState().activeProfile;
        if (!restored) navigate("/", { replace: true });
      });
    }
  }, [activeProfile, loadProfiles, navigate]);

  useEffect(() => {
    if (activeProfile?.id) loadForProfile(activeProfile.id);
  }, [activeProfile?.id, loadForProfile]);

  if (!settings || !activeProfile) {
    return (
      <div className="p-6 text-sm text-gray-400">加载设置中…</div>
    );
  }

  const carouselIdx = CAROUSEL_SPEED_ORDER.indexOf(settings.carouselSpeed);

  const handleExport = async () => {
    if (!activeProfile.id || exportState === "working") return;
    setExportState("working");
    try {
      const profileId = activeProfile.id;
      const [wordProgress, pets, petEvents, sessionHistory, checkAttempts] = await Promise.all([
        db.wordProgress.where({ profileId }).toArray(),
        db.pets.where({ profileId }).toArray(),
        db.petEvents.where({ profileId }).toArray(),
        db.sessionHistory.where({ profileId }).toArray(),
        db.checkAttempts.where({ profileId }).toArray(),
      ]);
      const dump = {
        exportedAt: new Date().toISOString(),
        profile: activeProfile,
        settings,
        wordProgress,
        pets,
        petEvents,
        sessionHistory,
        checkAttempts,
      };
      const blob = new Blob([JSON.stringify(dump, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `children-study-${activeProfile.name}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.warn("[Settings] export failed:", err);
      alert("导出失败:" + ((err as Error).message ?? "未知错误"));
    } finally {
      setExportState("idle");
    }
  };

  const handleResetProgress = async () => {
    if (!activeProfile.id) return;
    const profileId = activeProfile.id;
    try {
      // Reset only the current-path PEP3 progress per prompt. We'll go broad
      // and drop all wordProgress rows for this profile so it's a clean slate.
      // Parents who really want finer control can use export first.
      await db.wordProgress.where({ profileId }).delete();
      alert("已清空当前档案的学习进度 ✅");
    } catch (err) {
      console.warn("[Settings] reset failed:", err);
      alert("重置失败:" + ((err as Error).message ?? "未知错误"));
    } finally {
      setConfirmReset(false);
    }
  };

  return (
    <div className="min-h-full bg-gradient-to-b from-white to-sky-50">
      <div className="mx-auto max-w-2xl px-6 py-8">
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
            <h1 className="text-2xl font-bold text-gray-900">设置</h1>
          </div>
          <ProfileBadge profile={activeProfile} />
        </header>

        {/* -------- 轮播/学习 -------- */}
        <Card className="mb-5">
          <h2 className="mb-3 text-base font-semibold text-gray-800">
            📖 轮播 / 学习
          </h2>

          <div className="space-y-2">
            <Toggle
              label="挂机模式"
              helper="Tier 2–4 卡片 15 秒内没操作会自动跳过"
              checked={settings.ambientMode}
              onChange={(v) => updateField("ambientMode", v)}
            />

            <hr className="border-gray-100" />

            <Slider
              label="Tier 1 轮播速度"
              valueLabel={`${CAROUSEL_SPEED_MS[settings.carouselSpeed] / 1000}s`}
              helper="慢一些可以让孩子看得更清楚"
              min={0}
              max={2}
              step={1}
              value={carouselIdx < 0 ? 1 : carouselIdx}
              onChange={(i) =>
                updateField("carouselSpeed", CAROUSEL_SPEED_ORDER[i] ?? "normal")
              }
            />

            <hr className="border-gray-100" />

            <div>
              <Input
                type="number"
                min={5}
                max={30}
                label="每节课最多新词数"
                helper="建议 5–30 之间"
                value={settings.maxNewWordsPerSession}
                onChange={(e) => {
                  const n = Math.max(5, Math.min(30, Number(e.target.value) || 10));
                  updateField("maxNewWordsPerSession", n);
                }}
              />
            </div>

            <hr className="border-gray-100" />

            <div>
              <div className="mb-1 text-sm font-medium text-gray-800">
                复习前看范围
              </div>
              <div className="text-xs text-gray-500 mb-2">
                多长时间内快要到期的卡片会被纳入本节课复习
              </div>
              <div className="flex gap-2">
                {([
                  { label: "半天", value: 12 * 60 * 60 * 1000 },
                  { label: "一天", value: 24 * 60 * 60 * 1000 },
                  { label: "两天", value: 48 * 60 * 60 * 1000 },
                ] as const).map((opt) => (
                  <Button
                    key={opt.label}
                    size="sm"
                    variant={settings.dueLookaheadMs === opt.value ? "primary" : "secondary"}
                    onClick={() => updateField("dueLookaheadMs", opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* -------- 朗读 -------- */}
        <Card className="mb-5">
          <h2 className="mb-3 text-base font-semibold text-gray-800">
            🔊 朗读
          </h2>
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-sm font-medium text-gray-800">
                发音口音
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={settings.voiceAccent === "us" ? "primary" : "secondary"}
                  onClick={() => updateField("voiceAccent", "us")}
                >
                  美音 US
                </Button>
                <Button
                  size="sm"
                  variant={settings.voiceAccent === "uk" ? "primary" : "secondary"}
                  onClick={() => updateField("voiceAccent", "uk")}
                >
                  英音 UK
                </Button>
              </div>
            </div>
          </div>
        </Card>

        {/* -------- 宠物 / AI -------- */}
        <Card className="mb-5">
          <h2 className="mb-3 text-base font-semibold text-gray-800">
            🐾 宠物 / AI
          </h2>
          <div className="space-y-3">
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              AI 密钥已在服务器端配置，无需在此输入
            </div>

            <div>
              <div className="mb-1 text-sm font-medium text-gray-800">
                演出生成模式
              </div>
              <div className="flex flex-wrap gap-2">
                {([
                  { label: "完整 (full)", value: "full" },
                  { label: "节省 (saving)", value: "saving" },
                  { label: "离线 (offline)", value: "offline" },
                ] as const).map((opt) => (
                  <Button
                    key={opt.value}
                    size="sm"
                    variant={
                      settings.showGenerationMode === opt.value
                        ? "primary"
                        : "secondary"
                    }
                    onClick={() =>
                      updateField("showGenerationMode", opt.value as GenerationMode)
                    }
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            <Input
              type="number"
              min={1}
              max={10}
              label="每天 AI 演出次数上限"
              helper="节省模式下每天最多调用 Claude 的次数"
              value={settings.dailyShowAiQuota}
              onChange={(e) => {
                const n = Math.max(1, Math.min(10, Number(e.target.value) || 3));
                updateField("dailyShowAiQuota", n);
              }}
            />
          </div>
        </Card>

        {/* -------- 档案 -------- */}
        <Card className="mb-10">
          <h2 className="mb-3 text-base font-semibold text-gray-800">
            🗃️ 档案
          </h2>
          <div className="space-y-3">
            <Button
              variant="secondary"
              fullWidth
              onClick={handleExport}
              disabled={exportState === "working"}
            >
              {exportState === "working" ? "导出中…" : "导出进度 (JSON)"}
            </Button>
            <Button
              variant="danger"
              fullWidth
              onClick={() => setConfirmReset(true)}
            >
              重置当前档案的学习进度
            </Button>
          </div>
        </Card>
      </div>

      {confirmReset && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              确定重置进度?
            </h3>
            <p className="mb-5 text-sm text-gray-600">
              这会清空「{activeProfile.name}」的全部单词学习进度。建议先导出备份。
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                取消
              </Button>
              <Button variant="danger" onClick={handleResetProgress}>
                确定重置
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
