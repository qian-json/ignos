// Written with AI assistance (Claude Code)
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // `vercel dev` serves /api; plain `vite` dev proxies to it if running.
    proxy: { "/api": "http://localhost:3000" },
    // The panels import data files from the repo's data/ folder.
    fs: { allow: [".."] },
  },
  build: { chunkSizeWarningLimit: 1500 },
});
