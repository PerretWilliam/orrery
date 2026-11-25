// The whole interface on this computer, with nothing to set up: `npm run demo` (needs Docker). It starts a throwaway
// database, the dev server (hot reload) with the fake GitHub of the e2e suite, and writes what the setup and a GitHub
// sign-in would have left behind. `npm run demo -- --setup` leaves the instance empty, to look at the setup wizard.
// Nothing here ships: the application has no demo mode, and signing in is a cookie handed out by this script.
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { instanceAllowedHosts } from "@/lib/db/schema";
import { ENCRYPTION_KEYS, SETUP_TOKEN } from "../../e2e/support/constants";
import { finishSetup, signedDelivery } from "../../e2e/support/instance";

// 127.0.0.1 and not localhost: a browser keeps cookies by host, so a real instance on localhost keeps its session.
const HOST = "127.0.0.1";
const APP = `http://${HOST}:3200`;
// Port of the demo's data and sign-in links; also written in hub.yml.
const SIDE_PORT = 3201;
const SIDE = `http://${HOST}:${SIDE_PORT}`;
const DB = { container: "orrery-demo-db", url: `postgres://postgres:demo@${HOST}:55433/orrery_demo` };
const wizard = process.argv.includes("--setup");

const docker = (...args: string[]) => spawnSync("docker", args, { encoding: "utf8" });

async function until(what: string, check: () => Promise<boolean> | boolean, seconds = 120) {
  for (let i = 0; i < seconds; i++) {
    if (await Promise.resolve().then(check).catch(() => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

let cookies = new Map<string, string>();
const side = createServer((request, response) => {
  const url = new URL(request.url ?? "/", SIDE);
  if (url.pathname === "/data.json") {
    // Read on every request: edit the file and the widgets show it once their source expires.
    response.writeHead(200, { "content-type": "application/json" }).end(readFileSync("scripts/demo/data.json"));
  } else if (url.pathname === "/login" || url.pathname === "/logout") {
    const cookie = url.pathname === "/login" ? cookies.get(url.searchParams.get("as") ?? "alice") : undefined;
    response
      .writeHead(302, {
        "set-cookie": `orrery.session_token=${cookie ?? ""}; Path=/; HttpOnly; SameSite=Lax${cookie ? "" : "; Max-Age=0"}`,
        location: cookie ? APP : `${APP}/sign-in`,
      })
      .end();
  } else {
    response.writeHead(404).end();
  }
});

let app: ReturnType<typeof spawn> | undefined;
let stopped = false;
function stop(code: number) {
  if (stopped) return;
  stopped = true;
  app?.kill();
  docker("rm", "-f", DB.container);
  process.exit(code);
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) process.on(signal, () => stop(0));

async function main() {
  await new Promise<void>((resolve, reject) => side.once("error", reject).listen(SIDE_PORT, HOST, resolve));

  docker("rm", "-f", DB.container); // left over from a run that was killed
  const run = docker("run", "-d", "--rm", "--name", DB.container, "-e", "POSTGRES_PASSWORD=demo", "-e", "POSTGRES_DB=orrery_demo", "-p", `${HOST}:55433:5432`, "postgres:17-alpine");
  if (run.status !== 0) throw new Error(`Docker could not start the demo database: ${run.stderr?.trim() || run.error?.message}`);
  await until("the database", () => docker("exec", DB.container, "pg_isready", "-h", HOST, "-U", "postgres").status === 0);

  // Every variable the app reads is set, so that a local .env (a real instance's) cannot leak into the demo.
  app = spawn("node_modules/.bin/next", ["dev", "--hostname", HOST, "--port", new URL(APP).port], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: DB.url,
      ORRERY_ENCRYPTION_KEYS: ENCRYPTION_KEYS,
      ORRERY_SETUP_TOKEN: SETUP_TOKEN,
      ORRERY_ADMINS: "alice",
      ORRERY_SIGNIN_ALLOWLIST: "",
      ORRERY_PUBLIC_URL: "",
      FAKE_HUB_YML: "scripts/demo/hub.yml",
      FAKE_HUB_ROLE: "admin", // alice may open the project settings
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require ./e2e/support/fake-github.cjs`,
    },
  });
  app.on("exit", (code) => stop(code ?? 1));
  await until("the server", async () => (await fetch(`${APP}/healthz`)).ok);

  if (wizard) {
    console.log(`\nSetup wizard: ${APP}/setup\nSetup token:  ${SETUP_TOKEN}\n(Creating the GitHub App goes to the real GitHub: stop there.)\n`);
    return;
  }

  process.env.E2E_DATABASE_URL = DB.url; // where the e2e helpers write: always the throwaway database above
  cookies = await finishSetup(["alice", "bob"]);
  const pool = new Pool({ connectionString: DB.url });
  // The demo's data comes from this computer, which the SSRF guard refuses unless an admin allows it.
  await drizzle(pool).insert(instanceAllowedHosts).values({ host: HOST });
  await pool.end();
  const delivery = signedDelivery("installation", { action: "created" }, "demo-1");
  await fetch(`${APP}/api/webhooks/github`, { method: "POST", headers: delivery.headers, body: delivery.data });
  const headers = { cookie: `orrery.session_token=${cookies.get("alice")}` };
  await until("the demo project", async () => (await (await fetch(`${APP}/p/acme/web/overview`, { headers })).text()).includes("Starfall"));

  console.log(`
Demo ready. Ctrl+C stops it and deletes its database.

  Signed in as alice (admin of all)     ${SIDE}/login
  Signed in as bob (sees no project)    ${SIDE}/login?as=bob
  Signed out                            ${SIDE}/logout

Widgets and states: scripts/demo/hub.yml (restart to apply), scripts/demo/data.json (applied live).
`);
}

main().catch((error: Error) => {
  console.error(error.message);
  stop(1);
});
