import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";
import { seoRouteHtml } from "./vite-plugins/seo-route-html";

// https://vitejs.dev/config/
//
// Bundle-size note: pass `VISUALIZE=1 npm run build` (or build in development
// mode) to also emit `dist/stats.html` via rollup-plugin-visualizer for a
// one-off inspection. The visualizer is off in plain production builds so it
// doesn't add cost to CI/release builds. The enforced budget lives in
// `package.json` under `size-limit` and is checked by `npm run size:check`
// (wired into `.husky/pre-push`).
export default defineConfig(({ mode }) => {
  const wantVisualizer = mode !== "production" || process.env.VISUALIZE === "1";
  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [
      react(),
      seoRouteHtml(),
      wantVisualizer &&
        visualizer({
          filename: "dist/stats.html",
          gzipSize: true,
          brotliSize: false,
          template: "treemap",
        }),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    // esbuild target pinned explicitly (build + dep pre-bundling) because the
    // esbuild override (^0.28.1, see package.json) trips on vite 5's default
    // `'modules'` target: esbuild 0.28 tries to down-level destructuring against
    // the browser-version array + `supported` overrides and bails
    // ("Transforming destructuring ... is not supported yet"). `es2020` is
    // vite's default baseline anyway, so this keeps the same browser support
    // while avoiding that code path. Both call sites need it — `build.target`
    // covers `vite build`, `optimizeDeps` covers the dev server's pre-bundle.
    optimizeDeps: {
      esbuildOptions: {
        target: "es2020",
      },
    },
    build: {
      target: "es2020",
      rollupOptions: {
        output: {
          manualChunks: {
            // Heavy deps split into their own chunks so they cache independently
            // from app code (a normal app-only update doesn't invalidate them)
            // and so the main bundle stays small.
            libsodium: ["libsodium-wrappers-sumo"],
            recharts: ["recharts"],
          },
        },
      },
    },
  };
});
