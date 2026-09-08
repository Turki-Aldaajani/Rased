import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@anthropic-ai/sdk"],

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
