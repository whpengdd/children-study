// src/components/ui/Input.tsx
//
// Labeled input with error state. Used in NewProfileDialog (name) and the
// Settings screen (API key, numbers, etc).

import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: ReactNode;
  /** Optional error string; renders red text below the field. */
  error?: string;
  /** Optional helper text rendered below the field when `error` is absent. */
  helper?: ReactNode;
}

export function Input({
  label,
  error,
  helper,
  className = "",
  id,
  ...rest
}: InputProps) {
  const reactId = useId();
  const inputId = id ?? reactId;
  const borderCls = error
    ? "border-red-400 focus:ring-red-200"
    : "border-gray-200 focus:ring-orange-200";
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full rounded-xl border bg-white px-3 py-2 text-base outline-none transition focus:ring-4 ${borderCls} ${className}`.trim()}
        {...rest}
      />
      {error ? (
        <span className="text-xs text-red-500">{error}</span>
      ) : helper ? (
        <span className="text-xs text-gray-500">{helper}</span>
      ) : null}
    </div>
  );
}

export default Input;
