// src/components/ui/Toggle.tsx
//
// iOS-style switch. Uses a native <button role="switch"> for accessibility.

import type { ReactNode } from "react";

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: ReactNode;
  /** Optional helper text below the label. */
  helper?: ReactNode;
  disabled?: boolean;
}

export function Toggle({
  checked,
  onChange,
  label,
  helper,
  disabled = false,
}: ToggleProps) {
  const track =
    "relative inline-flex h-7 w-12 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-4 focus:ring-orange-200 disabled:cursor-not-allowed disabled:opacity-50";
  const bgCls = checked ? "bg-orange-400" : "bg-gray-300";
  const knobCls = `pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
    checked ? "translate-x-5" : "translate-x-0"
  }`;

  const btn = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`${track} ${bgCls}`}
    >
      <span className={knobCls} />
    </button>
  );

  if (!label && !helper) return btn;

  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="flex flex-col">
        {label && <span className="text-sm font-medium text-gray-800">{label}</span>}
        {helper && <span className="text-xs text-gray-500">{helper}</span>}
      </div>
      {btn}
    </div>
  );
}

export default Toggle;
