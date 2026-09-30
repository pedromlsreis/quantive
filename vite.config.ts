import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";
import { seoRouteHtml } from "./vite-plugins/seo-route-html";
import { devAutoLogin } from "./vite-plugins/dev-auto-login";
import { fontPreload } from "./vite-plugins/font-preload";

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
      // Before seoRouteHtml, which copies the finished index.html per route.
      fontPreload(),
      seoRouteHtml(),
      devAutoLogin(),
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
          // Heavy deps get their own chunks so they cache independently from
          // app code and stay out of the main bundle. A manual chunk also
          // absorbs every dependency no other chunk claims: left alone, React,
          // clsx and the Babel helpers landed in the recharts chunk and made
          // every route preload it. They share one small vendor chunk instead.
          manualChunks(id) {
            if (id.includes("/node_modules/libsodium")) return "libsodium";
            if (/\/node_modules\/(react|react-dom|scheduler|react-is|use-sync-external-store|clsx|@babel\/runtime)\//.test(id)) return "vendor";
            if (id.includes("/node_modules/recharts/")) return "recharts";
            return undefined;
          },
        },
      },
    },
  };
});
