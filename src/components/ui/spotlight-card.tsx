"use client";

import type { ComponentProps, ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Spotlight } from "@/components/ui/spotlight";
import { cn } from "@/lib/utils";

interface SpotlightCardProps extends ComponentProps<"div"> {
  children: ReactNode;
  /** Diameter of the light, in pixels. */
  size?: number;
  /** Classes for the layer the contents sit on, above the light. */
  contentClassName?: string;
}

/**
 * A card that lights up under the cursor, in the identity's own teal. The
 * light sits behind the contents, so nothing on the card is tinted by it.
 */
export function SpotlightCard({
  children,
  className,
  contentClassName,
  size = 300,
  ...props
}: SpotlightCardProps) {
  return (
    <Card
      className={cn(
        "relative flex flex-col overflow-hidden transition-colors duration-200 hover:border-border-strong",
        className,
      )}
      {...props}
    >
      <Spotlight size={size} />
      <div className={cn("relative flex-1", contentClassName)}>{children}</div>
    </Card>
  );
}
