"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface SpotlightProps {
  className?: string;
  /** Diameter of the light in pixels. */
  size?: number;
}

/**
 * A soft light that follows the cursor inside its parent element.
 *
 * It lights the panel in the identity green rather than the usual white, so
 * the 3D card reads as part of this interface and not as a dropped-in widget.
 * Drop it inside any element — the parent is made `relative` automatically.
 */
export function Spotlight({ className, size = 320 }: SpotlightProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [parent, setParent] = useState<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const spring = { bounce: 0, damping: 28, stiffness: 260 };
  const springX = useSpring(mouseX, spring);
  const springY = useSpring(mouseY, spring);
  const left = useTransform(springX, (x) => `${x - size / 2}px`);
  const top = useTransform(springY, (y) => `${y - size / 2}px`);

  useEffect(() => {
    const el = containerRef.current?.parentElement;
    if (!el) return;
    el.style.position = "relative";
    el.style.overflow = "hidden";
    setParent(el);
  }, []);

  const onMove = useCallback(
    (event: MouseEvent) => {
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      mouseX.set(event.clientX - rect.left);
      mouseY.set(event.clientY - rect.top);
    },
    [parent, mouseX, mouseY],
  );

  useEffect(() => {
    if (!parent) return;
    const enter = () => setVisible(true);
    const leave = () => setVisible(false);
    parent.addEventListener("mousemove", onMove);
    parent.addEventListener("mouseenter", enter);
    parent.addEventListener("mouseleave", leave);
    return () => {
      parent.removeEventListener("mousemove", onMove);
      parent.removeEventListener("mouseenter", enter);
      parent.removeEventListener("mouseleave", leave);
    };
  }, [parent, onMove]);

  return (
    <motion.div
      ref={containerRef}
      className={cn(
        "pointer-events-none absolute rounded-full blur-2xl transition-opacity duration-300",
        className,
      )}
      style={{
        width: size,
        height: size,
        left,
        top,
        background:
          "radial-gradient(circle at center, color-mix(in srgb, var(--interactive) 40%, transparent) 0%, color-mix(in srgb, var(--brand-deep) 22%, transparent) 45%, transparent 72%)",
      }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.25 }}
      aria-hidden
    />
  );
}
