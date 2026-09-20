import type * as React from "react";
import { cn } from "@/lib/utils";

export interface ChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Draws the chip as the current choice. */
  selected?: boolean;
}

/**
 * A choice big enough to look like one.
 *
 * Wherever a member picks their own name or their field, it is this: a real
 * target with a real border, a hover state and a focus ring — not a word in
 * muted text that happens to be clickable.
 */
export function Chip({ selected, className, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "rounded-full border px-4 py-2 text-sm transition-colors duration-200",
        "hover:border-border-strong hover:bg-muted hover:text-foreground",
        selected
          ? "border-primary bg-primary-muted text-foreground"
          : "border-border bg-card text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
