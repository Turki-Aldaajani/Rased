"use client";

import { useEffect, useRef, useState } from "react";
import { InjazMark } from "@/components/brand/InjazLogo";
import { Card } from "@/components/ui/card";
import { SplineScene } from "@/components/ui/splite";
import { Spotlight } from "@/components/ui/spotlight";

const DEFAULT_SCENE =
  "https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode";

/**
 * The scene is hosted, so the robot's materials cannot be changed from here.
 * A CSS filter on the canvas is the one lever there is.
 *
 * Sampling the rendered canvas first was worth it: the robot is a black body
 * lit blue-green (its lit pixels measure ~177°, already between #155043 and
 * #125D64), not the neutral silver it looks like. So the usual grey-tinting
 * recipe — sepia, then a big hue rotation — sends it past teal into blue,
 * which is a colour the identity does not have. Strengthening what the scene
 * already has is both truer to the identity and safer: saturation deepens the
 * green, the small rotation leans it off cyan toward the brand, and the
 * brightness lifts the body out of flat black without blowing the highlights.
 */
const ROBOT_TINT =
  "hue-rotate(-10deg) saturate(2.1) brightness(1.14) contrast(0.96)";

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
    <div ref={ref} className="w-full">
      <Card className="relative overflow-hidden border-border bg-background">
        {/* The identity's diagonal wash — brand-deep into gold, kept low
            enough that it lights the card without colouring it. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "var(--identity-gradient)" }}
          aria-hidden
        />
        <InjazMark className="pointer-events-none absolute -bottom-6 start-6 h-40 opacity-[0.07]" />
        <Spotlight size={360} />

        <div className="relative flex flex-col md:flex-row">
          <div className="flex flex-1 flex-col justify-center p-8 md:p-10">
            <h2 className="font-serif-display text-lg font-semibold tracking-tight text-foreground">
              إنجــازك...بصمتـــك
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
              رابطك يُفتح ويُقرأ، ويُتحقق منه على الإنترنت، ويُؤرَّخ بإعلانه
              الأصلي — لا بوقت اكتشافك له — ويُصنَّف على أقسام النشرة، ويُقارَن
              بكل مساهمة سابقة قبل أن تُحتسب نقطتك.
            </p>
          </div>

          <div
            className="relative h-64 flex-1 md:h-80"
            style={{ filter: ROBOT_TINT }}
          >
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
