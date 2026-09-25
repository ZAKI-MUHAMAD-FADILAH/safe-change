import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    testTimeout: 30000,
    hookTimeout: 15000,
    include: ["tests/**/*.test.ts"],
    pool: "forks",
  },
});
