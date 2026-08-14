/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Forward API + auth calls to the Hono server so everything is same-origin in dev
      "/api": {
        target: process.env.API_URL ?? "http://localhost:3000",
        changeOrigin: false,
      },
    },
  },
  test: {
    environment: "jsdom",
    // i18next has to be initialised before the first component renders, the
    // same as it is in main.tsx.
    setupFiles: ["./src/test-setup.ts"],
  },
});
