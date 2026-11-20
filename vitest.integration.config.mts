import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Integration tests: Testcontainers (Postgres) and MSW. Requires Docker.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
