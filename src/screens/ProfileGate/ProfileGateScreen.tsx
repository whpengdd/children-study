// src/screens/ProfileGate/ProfileGateScreen.tsx
//
// The home / "/" screen. Lists every child profile on the device and lets you:
//   - Tap a profile   → loads it + navigates to /path
//   - Tap the "+"     → opens NewProfileDialog
//   - Edit/delete a profile from its hover-icons
//   - Auto-open NewProfileDialog on first launch (no profiles yet)

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../../components/ui/Button";
import { useProfileStore } from "../../store/useProfileStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import { usePathStore } from "../../store/usePathStore";
import type { Profile } from "../../types";

import NewProfileDialog from "./NewProfileDialog";
import ProfileCard from "./ProfileCard";

export default function ProfileGateScreen() {
  const navigate = useNavigate();

  const {
    profiles,
    loading,
    loadProfiles,
    createProfile,
    selectProfile,
    updateProfile,
    deleteProfile,
  } = useProfileStore();
  const loadSettings = useSettingsStore((s) => s.loadForProfile);
  const loadPath = usePathStore((s) => s.loadForProfile);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [dialogError, setDialogError] = useState<string | undefined>();
  const [confirmDelete, setConfirmDelete] = useState<Profile | null>(null);

  // Initial load. If there are zero profiles, auto-open the create dialog.
  useEffect(() => {
    loadProfiles().then(() => {
      const current = useProfileStore.getState().profiles;
      if (current.length === 0) {
        setDialogOpen(true);
      }
    });
  }, [loadProfiles]);

  // Auto-open the dialog if the profile list goes to empty (e.g. after a delete).
  useEffect(() => {
    if (!loading && profiles.length === 0) {
      setDialogOpen(true);
      setEditTarget(null);
    }
  }, [loading, profiles.length]);

  const handleSelectProfile = async (profile: Profile) => {
    if (profile.id == null) return;
    try {
      await selectProfile(profile.id);
      // Kick off background loads for this profile so PathSelect is instant.
      loadSettings(profile.id).catch(() => {});
      loadPath(profile.id).catch(() => {});
      navigate("/path");
    } catch (err) {
      console.warn("[ProfileGate] selectProfile failed:", err);
    }
  };

  const openCreate = () => {
    setEditTarget(null);
    setDialogError(undefined);
    setDialogOpen(true);
  };

  const openEdit = (profile: Profile) => {
    setEditTarget(profile);
    setDialogError(undefined);
    setDialogOpen(true);
  };

  const handleSubmitDialog = async (input: {
    name: string;
    avatarEmoji: string;
  }) => {
    setDialogError(undefined);
    try {
      if (editTarget?.id != null) {
        await updateProfile(editTarget.id, {
          name: input.name,
          avatarEmoji: input.avatarEmoji,
        });
      } else {
        await createProfile(input);
      }
      setDialogOpen(false);
    } catch (err) {
      // profileService throws Error objects with `.kind`; show friendly msg.
      const msg =
        (err as Error).message ?? "创建失败,换个名字试试?";
      if ((err as { kind?: string }).kind === "duplicate_name") {
        setDialogError("这个名字已经存在啦");
      } else {
        setDialogError(msg);
      }
    }
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDelete?.id) return;
    try {
      await deleteProfile(confirmDelete.id);
    } catch (err) {
      console.warn("[ProfileGate] deleteProfile failed:", err);
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div className="min-h-full bg-gradient-to-b from-sky-50 via-orange-50 to-pink-50">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <header className="mb-10 text-center">
          <h1 className="mb-2 text-4xl font-bold text-gray-900 sm:text-5xl">
            欢迎回来!
          </h1>
          <p className="text-base text-gray-600">
            选一个小伙伴开始学单词吧 ✨
          </p>
        </header>

        {loading && profiles.length === 0 ? (
          <div className="py-16 text-center text-gray-400">加载中…</div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((profile) => (
              <ProfileCard
                key={profile.id ?? profile.name}
                profile={profile}
                onSelect={handleSelectProfile}
                onEdit={openEdit}
                onDelete={(p) => setConfirmDelete(p)}
              />
            ))}

            <button
              type="button"
              onClick={openCreate}
              className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-orange-300 bg-white/60 px-6 py-8 text-orange-500 transition hover:border-orange-400 hover:bg-white hover:text-orange-600 active:scale-[0.98]"
              aria-label="新建档案"
            >
              <span className="text-6xl leading-none">＋</span>
              <span className="text-lg font-medium">新建档案</span>
            </button>
          </div>
        )}

        <div className="mt-12 text-center text-xs text-gray-400">
          档案只保存在这台设备上,不会上传任何地方 · v1
        </div>
      </div>

      <NewProfileDialog
        open={dialogOpen}
        initial={
          editTarget
            ? {
                name: editTarget.name,
                avatarEmoji: editTarget.avatarEmoji,
              }
            : undefined
        }
        error={dialogError}
        onCancel={() => {
          // Don't allow closing if there are zero profiles — must create one first.
          if (profiles.length === 0 && !editTarget) return;
          setDialogOpen(false);
        }}
        onSubmit={handleSubmitDialog}
      />

      {confirmDelete && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              删除档案?
            </h3>
            <p className="mb-5 text-sm text-gray-600">
              将删除「{confirmDelete.name}」的档案。学习记录会保留在这台设备上,但档案本身会被移除。
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setConfirmDelete(null)}
              >
                取消
              </Button>
              <Button variant="danger" onClick={handleDeleteConfirm}>
                删除
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
