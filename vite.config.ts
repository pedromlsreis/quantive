import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
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
});
