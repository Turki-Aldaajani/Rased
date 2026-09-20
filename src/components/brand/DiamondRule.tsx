import { cn } from "@/lib/utils";

/**
 * The identity's diamond motif, used the way the newsletter uses it: a quiet
 * rule between sections. Green and gold alternate, both small and both dim,
 * it marks a seam, it does not decorate one.
 */
export function DiamondRule({
  count = 5,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn("flex items-center gap-4 py-2", className)}
      role="separator"
      aria-hidden
    >
      <span className="h-px flex-1 bg-border" />
      <span className="flex items-center gap-2">
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className="size-1.5 rotate-45"
            style={{
              background: i % 2 === 0 ? "var(--interactive)" : "var(--gold)",
              opacity: 0.55,
            }}
          />
        ))}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
