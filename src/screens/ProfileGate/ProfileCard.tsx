// src/screens/ProfileGate/ProfileCard.tsx
//
// Big tappable tile representing a child's profile. Shows avatar emoji + name
// and exposes small edit/delete buttons in a corner.

import type { Profile } from "../../types";

export interface ProfileCardProps {
  profile: Profile;
  onSelect: (profile: Profile) => void;
  onEdit?: (profile: Profile) => void;
  onDelete?: (profile: Profile) => void;
}

export function ProfileCard({
  profile,
  onSelect,
  onEdit,
  onDelete,
}: ProfileCardProps) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => onSelect(profile)}
        className="w-full flex flex-col items-center gap-3 rounded-3xl bg-white px-6 py-8 shadow-md border border-gray-100 transition hover:shadow-xl hover:-translate-y-1 active:translate-y-0 active:shadow-sm"
        aria-label={`选择档案 ${profile.name}`}
      >
        <span
          aria-hidden
          className="text-7xl leading-none select-none"
        >
          {profile.avatarEmoji}
        </span>
        <span className="text-2xl font-semibold text-gray-900">
          {profile.name}
        </span>
        {profile.lastPath && (
          <span className="text-xs text-gray-500">
            上次学习:{describePath(profile.lastPath)}
          </span>
        )}
      </button>

      {(onEdit || onDelete) && (
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
          {onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(profile);
              }}
              className="rounded-full bg-white/90 border border-gray-200 p-1 text-xs shadow hover:bg-gray-50"
              aria-label={`修改 ${profile.name}`}
            >
              ✏️
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(profile);
              }}
              className="rounded-full bg-white/90 border border-gray-200 p-1 text-xs shadow hover:bg-gray-50"
              aria-label={`删除 ${profile.name}`}
            >
              🗑️
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function describePath(
  path: NonNullable<Profile["lastPath"]>,
): string {
  if (path.kind === "pep") return `PEP${path.grade}`;
  return path.exam;
}

export default ProfileCard;
