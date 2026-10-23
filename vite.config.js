import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative base so the build works from any path, including GitHub Pages'
  // /exio-app-guest-mode-home/ subpath.
  base: "./",
  plugins: [react()],
  build: {
    // three.js (the 3D logo) is a lazily loaded chunk of ~560 kB; it never
    // blocks first paint, so don't warn about it.
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    strictPort: false,
  },
});
