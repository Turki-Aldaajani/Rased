import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors duration-200",
  {
    variants: {
      variant: {
        // Quiet by default: a badge is a label, not a colour accent.
        default: "border-border bg-transparent text-muted-foreground",
        solid: "border-transparent bg-muted text-foreground",
        primary: "border-transparent bg-primary-muted text-primary",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
