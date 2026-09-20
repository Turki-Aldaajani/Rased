"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { cn } from "@/lib/utils";

/** useLayoutEffect on the client, useEffect on the server — no SSR warning. */
const useIsoLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

interface CountUpProps extends ComponentProps<"span"> {
  value: number;
  /** How long the whole count takes, in milliseconds. */
  duration?: number;
}

/**
 * A number that counts up to itself the first time it is scrolled into view.
 *
 * The final value is what the server renders, so the page is correct without
 * JavaScript; the climb is set up before the first paint, so the number never
 * flashes its answer and then restarts. Reduced motion skips the climb.
 */
export function CountUp({
  value,
  duration = 900,
  className,
  ...props
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useIsoLayoutEffect(() => {
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      setShown(value);
      return;
    }
    setShown(0);
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      return;
    }

    let frame = 0;
    let backstop = 0;
    const run = () => {
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        // Ease-out: fast at first, then settling — the way a tally lands.
        const eased = 1 - (1 - t) ** 3;
        setShown(Math.round(value * eased));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      // Animation frames stop in a backgrounded tab, and a number that is
      // still climbing when that happens would be left reading nought. The
      // timer keeps running, so it lands the real value either way.
      backstop = window.setTimeout(() => {
        cancelAnimationFrame(frame);
        setShown(value);
      }, duration + 300);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          run();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(backstop);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)} {...props}>
      {shown}
    </span>
  );
}
