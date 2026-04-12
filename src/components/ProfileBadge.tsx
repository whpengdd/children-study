// src/components/ProfileBadge.tsx
//
// Compact "who's logged in" chip used in the top-right of PathSelect /
// Settings / Stats. Tapping it jumps back to `/` so the child can switch
// profiles.

import { useNavigate } from "react-router-dom";

import type { Profile } from "../types";

export interface ProfileBadgeProps {
  profile: Profile | null;
  /** If true, clicking the badge navigates back to "/". Default true. */
  navigateOnClick?: boolean;
  onClick?: () => void;
}

export function ProfileBadge({
  profile,
  navigateOnClick = true,
  onClick,
}: ProfileBadgeProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }
    if (navigateOnClick) navigate("/");
  };

  if (!profile) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm text-gray-500 shadow-sm border border-gray-200"
      >
        <span aria-hidden>👤</span>
        <span>选择档案</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-medium text-gray-800 shadow-sm border border-gray-200 hover:bg-gray-50 active:scale-[0.98] transition"
      aria-label={`当前档案:${profile.name}(点击切换)`}
    >
      <span aria-hidden className="text-lg leading-none">
        {profile.avatarEmoji}
      </span>
      <span>{profile.name}</span>
    </button>
  );
}

export default ProfileBadge;
