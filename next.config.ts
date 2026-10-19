import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `pg` optionally requires the native `pg-native` binding at runtime, which
   * webpack cannot resolve at build time. Keeping it external leaves the
   * require in place, where it fails softly and falls back to the JS driver.
   */
  serverExternalPackages: ["@anthropic-ai/sdk", "pg"],

  /**
   * The preview card is drawn at publish time from font files the route reads
   * from disk by path, which the build's file tracing cannot see on its own.
   */
  outputFileTracingIncludes: {
    "/api/newsletters/[id]/publish": ["./src/assets/fonts/**"],
  },

  /**
   * A reviewer's page carries a personal token in its path: never cached by
   * anything in between, never indexed.
   */
  async headers() {
    return [
      {
        source: "/review/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },

  /**
   * The Spline runtime references Draco decoder assets that it fetches from a
   * CDN at runtime and does not ship in the package. Webpack tries to resolve
   * those paths at build time and fails, so they are marked external — the
   * bundle keeps the request, the browser never makes it for our scene.
   */
  webpack: (config) => {
    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : []),
      ({ request }: { request?: string }, callback: (err?: unknown, result?: string) => void) => {
        if (request && /(^|\/)libs\/draco\/|boolean_wasm_bg\.wasm$/.test(request)) {
          return callback(null, `var {}`);
        }
        callback();
      },
    ];
    return config;
  },
};

export default nextConfig;
