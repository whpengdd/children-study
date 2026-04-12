// src/components/ui/Card.tsx
//
// Generic rounded-2xl card. Used as:
//   - Profile tile in ProfileGate
//   - Grade/exam tile in PathSelect
//   - Section container in Settings / Stats
//
// The shape is intentionally simple — variations come from utility classes
// passed in via `className`, not props.

import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds hover lift + cursor-pointer. Use when the whole card is tappable. */
  interactive?: boolean;
  /** Remove default padding; useful for full-bleed media inside the card. */
  noPadding?: boolean;
  children: ReactNode;
}

export function Card({
  interactive = false,
  noPadding = false,
  className = "",
  children,
  ...rest
}: CardProps) {
  const base =
    "bg-white rounded-2xl shadow-sm border border-gray-100 transition-all duration-150";
  const pad = noPadding ? "" : "p-5";
  const hover = interactive
    ? "cursor-pointer hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm"
    : "";
  return (
    <div
      className={`${base} ${pad} ${hover} ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
}

export default Card;
