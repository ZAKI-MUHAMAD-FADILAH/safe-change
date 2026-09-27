import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    testTimeout: 60000,
    hookTimeout: 30000,
    include: ["tests/**/*.test.ts"],
    pool: "forks",
  },
});
