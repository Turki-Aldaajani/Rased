"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { SplineScene } from "@/components/ui/splite";
import { Spotlight } from "@/components/ui/spotlight";

const DEFAULT_SCENE =
  "https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode";

/**
 * The one piece of visual weight on the home page. It sits under the composer,
 * so the paste-a-link field is still the first and only thing to act on, and
 * the scene itself is not even requested until the card scrolls into view.
 */
export default function HeroScene({ scene = DEFAULT_SCENE }: { scene?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="mx-auto mt-20 w-full max-w-3xl">
      <Card className="relative overflow-hidden border-border bg-surface-deep">
        <Spotlight size={360} />

        <div className="flex flex-col md:flex-row">
          <div className="flex flex-1 flex-col justify-center p-8 md:p-10">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Nothing is taken at face value
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
              Your link is opened and read, checked against the web, dated from
              its original announcement — not from when you found it — and
              compared with every earlier find before it scores.
            </p>
          </div>

          <div className="relative h-64 flex-1 md:h-80">
            {inView ? (
              <SplineScene scene={scene} className="h-full w-full" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <span className="loader" aria-hidden />
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
