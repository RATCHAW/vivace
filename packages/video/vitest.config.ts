/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The compositions are React that also runs headlessly, so their tests need a
// DOM. apps/web used to host them; they moved here with the components.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
  },
});
