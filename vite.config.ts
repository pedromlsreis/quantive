import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";

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
    build: {
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
