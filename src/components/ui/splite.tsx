"use client";

import { Suspense, lazy } from "react";

const Spline = lazy(() => import("@splinetool/react-spline"));

interface SplineSceneProps {
  scene: string;
  className?: string;
}

/**
 * The Spline runtime is heavy, so it is code-split and only fetched once this
 * component mounts. Until then the fallback spinner holds the space.
 */
export function SplineScene({ scene, className }: SplineSceneProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center">
          <span className="loader" aria-label="Loading the 3D scene" />
        </div>
      }
    >
      <Spline scene={scene} className={className} />
    </Suspense>
  );
}
