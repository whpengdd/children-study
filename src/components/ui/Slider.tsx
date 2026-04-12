// src/components/ui/Slider.tsx
//
// Thin wrapper around <input type="range"> so slider styling stays uniform
// across Settings / carousel speed. Accepts either a numeric range or a
// discrete step-index mode.

import type { ReactNode } from "react";

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
  label?: ReactNode;
  helper?: ReactNode;
  /** Optional rendering of the current value, e.g. "4s". */
  valueLabel?: ReactNode;
  disabled?: boolean;
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  helper,
  valueLabel,
  disabled = false,
}: SliderProps) {
  return (
    <div className="flex flex-col gap-1.5 py-1">
      {(label || valueLabel) && (
        <div className="flex items-center justify-between">
          {label && (
            <span className="text-sm font-medium text-gray-800">{label}</span>
          )}
          {valueLabel && (
            <span className="text-xs text-gray-500">{valueLabel}</span>
          )}
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-orange-400 disabled:opacity-50"
      />
      {helper && <span className="text-xs text-gray-500">{helper}</span>}
    </div>
  );
}

export default Slider;
