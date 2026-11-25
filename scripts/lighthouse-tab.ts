// Lighthouse on a signed-in tab of ten widgets and on the sign-in page of a real instance. It needs a real instance, so this boots the production build
// against a database and the fake GitHub of the e2e suite, signs a user in, and hands the session cookie to Lighthouse CI.
// Usage: E2E_DATABASE_URL=postgres://... npx tsx scripts/lighthouse-tab.ts   (after `npm run build`)
import { spawn } from "node:child_process";
import {
  ENCRYPTION_KEYS,
  INSTANCE_URL,
  SETUP_TOKEN,
} from "../e2e/support/constants";
import {
  finishSetup,
  resetInstance,
  signedDelivery,
} from "../e2e/support/instance";

const TAB = `${INSTANCE_URL}/p/acme/web/perf`;
const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl) throw new Error("E2E_DATABASE_URL is not set");

const server = spawn(
  "npm",
  ["run", "start", "--", "--port", new URL(INSTANCE_URL).port],
  {
    stdio: ["ignore", "inherit", "inherit"],
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      ORRERY_SETUP_TOKEN: SETUP_TOKEN,
      ORRERY_ENCRYPTION_KEYS: ENCRYPTION_KEYS,
      NODE_OPTIONS: "--require ./e2e/support/fake-github.cjs",
    },
  },
);

async function until(
  what: string,
  check: () => Promise<boolean>,
  seconds = 90,
) {
  for (let i = 0; i < seconds; i++) {
    if (await check().catch(() => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

async function main(): Promise<number> {
  let code = 1;
  try {
    await until(
      "the server",
      async () => (await fetch(`${INSTANCE_URL}/healthz`)).ok,
    );
    await resetInstance();
    const cookie = (await finishSetup(["alice"])).get("alice");
    const delivery = signedDelivery(
      "installation",
      { action: "created" },
      "lighthouse-1",
    );
    await fetch(`${INSTANCE_URL}/api/webhooks/github`, {
      method: "POST",
      headers: delivery.headers,
      body: delivery.data,
    });
    const headers = { cookie: `orrery.session_token=${cookie}` };
    await until("the tab with its ten widgets", async () =>
      (await (await fetch(TAB, { headers })).text()).includes("P10"),
    );
    const audit = (url: string, extra: string[] = []) =>
      new Promise<number>((resolve) =>
        spawn(
          "npx",
          [
            "lhci",
            "autorun",
            "--config=lighthouserc.tab.json",
            `--collect.url=${url}`,
            ...extra,
          ],
          { stdio: "inherit" },
        ).on("close", (status) => resolve(status ?? 1)),
      );
    const tab = await audit(TAB, [
      `--collect.settings.extraHeaders=${JSON.stringify(headers)}`,
    ]);
    const signIn = await audit(`${INSTANCE_URL}/sign-in`);
    code = tab || signIn;
  } finally {
    server.kill();
  }
  return code;
}

main().then((code) => process.exit(code));
