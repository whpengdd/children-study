// src/screens/ProfileGate/NewProfileDialog.tsx
//
// Modal for creating (or renaming) a profile. 20-emoji picker grid + name
// input, used from ProfileGateScreen.

import { useEffect, useState } from "react";

import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";

export const AVATAR_EMOJIS: string[] = [
  "🦄",
  "🐼",
  "🐯",
  "🦊",
  "🐸",
  "🐧",
  "🐨",
  "🐰",
  "🐵",
  "🦁",
  "🐻",
  "🐶",
  "🐱",
  "🐷",
  "🐮",
  "🐔",
  "🐙",
  "🦉",
  "🦋",
  "🐢",
];

export interface NewProfileDialogProps {
  open: boolean;
  /** If provided, edits an existing profile instead of creating a new one. */
  initial?: { name: string; avatarEmoji: string };
  /** Title override; default is "新建档案" unless editing. */
  title?: string;
  /** Optional error from parent (e.g. duplicate name). */
  error?: string;
  onCancel: () => void;
  onSubmit: (input: { name: string; avatarEmoji: string }) => void | Promise<void>;
}

export function NewProfileDialog({
  open,
  initial,
  title,
  error,
  onCancel,
  onSubmit,
}: NewProfileDialogProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [emoji, setEmoji] = useState(initial?.avatarEmoji ?? AVATAR_EMOJIS[0]);
  const [submitting, setSubmitting] = useState(false);

  // Reset whenever the dialog opens so stale state doesn't leak between uses.
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setEmoji(initial?.avatarEmoji ?? AVATAR_EMOJIS[0]);
    setSubmitting(false);
  }, [open, initial?.name, initial?.avatarEmoji]);

  if (!open) return null;

  const effectiveTitle = title ?? (initial ? "修改档案" : "新建档案");
  const canSubmit = name.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), avatarEmoji: emoji });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-2xl font-semibold text-gray-900">
          {effectiveTitle}
        </h2>

        <div className="mb-4">
          <Input
            label="名字"
            placeholder="比如:小明"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={12}
            autoFocus
            error={error}
          />
        </div>

        <div className="mb-5">
          <div className="mb-2 text-sm font-medium text-gray-700">选一个头像</div>
          <div className="grid grid-cols-5 gap-2">
            {AVATAR_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className={`text-3xl rounded-2xl p-2 border transition ${
                  emoji === e
                    ? "border-orange-400 bg-orange-50 ring-2 ring-orange-200"
                    : "border-gray-100 hover:bg-gray-50"
                }`}
                aria-label={`选择头像 ${e}`}
                aria-pressed={emoji === e}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={submitting}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {initial ? "保存" : "创建"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default NewProfileDialog;
