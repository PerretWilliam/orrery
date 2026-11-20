import { defineConfig } from "@playwright/test";

// E2E runs against the production build.
export default defineConfig({
  testDir: "e2e",
  webServer: { command: "npm run start", url: "http://localhost:3000", reuseExistingServer: !process.env.CI },
  use: { baseURL: "http://localhost:3000" },
});
