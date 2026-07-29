/// <reference types="vitest" />
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  test: {
    name: "unit",
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules/**", ".worktrees/**"],
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/index.tsx"],
      thresholds: { lines: 90, functions: 85, branches: 85, statements: 90 },
    },
  },
})
