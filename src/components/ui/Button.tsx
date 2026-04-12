// src/components/ui/Button.tsx
//
// Shared button primitive. Variants are tuned for a playful-but-usable kids
// UI — primary = large colorful action, secondary = neutral card button,
// ghost = minimal text button, danger = destructive confirm.

import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-br from-orange-400 to-pink-500 text-white shadow-md hover:shadow-lg active:scale-[0.98]",
  secondary:
    "bg-white text-gray-800 border border-gray-200 shadow-sm hover:bg-gray-50 active:scale-[0.98]",
  ghost:
    "bg-transparent text-gray-700 hover:bg-gray-100 active:bg-gray-200",
  danger:
    "bg-red-500 text-white shadow-md hover:bg-red-600 active:scale-[0.98]",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "text-sm px-3 py-1.5 rounded-xl",
  md: "text-base px-4 py-2.5 rounded-2xl",
  lg: "text-lg px-6 py-3.5 rounded-2xl font-semibold",
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 select-none disabled:opacity-50 disabled:cursor-not-allowed";
  const widthCls = fullWidth ? "w-full" : "";
  return (
    <button
      type="button"
      className={`${base} ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${widthCls} ${className}`.trim()}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  );
}

export default Button;
