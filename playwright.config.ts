import { defineConfig } from "@playwright/test";
import { ENCRYPTION_KEYS, SETUP_TOKEN } from "./e2e/support/constants";

// E2E runs against the production build, with two servers:
// - "bare": no database, what a container prints before it is configured (port 3000);
// - "instance": a database and a fake GitHub, for the journeys of a real instance (port 3001). It needs
//   E2E_DATABASE_URL, an empty Postgres database that the tests are free to wipe; without it only "bare" runs.
const database = process.env.E2E_DATABASE_URL;
const bareServer = { command: "npm run start", url: "http://localhost:3000", reuseExistingServer: !process.env.CI, env: { DATABASE_URL: "" } };
const instanceServer = {
  command: "npm run start -- --port 3001",
  url: "http://localhost:3001/healthz",
  reuseExistingServer: false,
  env: {
    DATABASE_URL: database ?? "",
    ORRERY_SETUP_TOKEN: SETUP_TOKEN,
    ORRERY_ENCRYPTION_KEYS: ENCRYPTION_KEYS,
    NODE_OPTIONS: "--require ./e2e/support/fake-github.cjs",
  },
};

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  webServer: database ? [bareServer, instanceServer] : [bareServer],
  projects: [
    { name: "bare", testMatch: "home.spec.ts", use: { baseURL: "http://localhost:3000" } },
    ...(database ? [{ name: "instance", testMatch: "instance.spec.ts", use: { baseURL: "http://localhost:3001" } }] : []),
  ],
});
