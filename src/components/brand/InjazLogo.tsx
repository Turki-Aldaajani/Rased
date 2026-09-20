import { cn } from "@/lib/utils";

/**
 * The Injaz mark — the arch of the identity, drawn from the point of the
 * letter zay. These are the same two paths the newsletter draws behind its
 * hero (`.arch` in Issue #1), so the app and the published issues carry one
 * logo and not two drawings of it.
 */
export function InjazMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 340"
      className={cn("block h-6 w-auto", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
      focusable="false"
    >
      <path
        d="M12 340V140c0-15 6-29 16-39L102 27c10-10 26-10 36 0l74 74c10 10 16 24 16 39v200"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M34 340V146c0-10 4-19 11-26l64-64c6-6 16-6 22 0l64 64c7 7 11 16 11 26v194"
        vectorEffect="non-scaling-stroke"
        opacity={0.45}
      />
    </svg>
  );
}

/** The word itself, tatweel-spaced exactly as the identity sets it. */
export function InjazWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-serif-display leading-none", className)}>
      إنـجـاز
    </span>
  );
}

/** The line that closes every page: the identity's own strapline. */
export const INJAZ_TAGLINE = "إنجــازك...بصمتـــك";
