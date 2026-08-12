/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
  },
});
