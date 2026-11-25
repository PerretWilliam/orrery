import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";
import {
  finishSetup,
  INSTANCE_URL,
  resetInstance,
  SETUP_TOKEN,
  signedDelivery,
} from "./support/instance";

// The critical journeys of a real instance: production build, Postgres, and a fake GitHub behind the real adapter.
// One server and one database for the whole file, so the journeys run in order.
test.describe.configure({ mode: "serial" });

test.beforeAll(resetInstance);

test("a new instance sends the first visitor to the setup, which asks for the token", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByText("Set up Orrery", { exact: true })).toBeVisible();

  await page.getByLabel("Setup token").fill("not-the-token");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Something went wrong")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create the GitHub App" }),
  ).toHaveCount(0);

  await page.getByLabel("Setup token").fill(SETUP_TOKEN);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("button", { name: "Create the GitHub App" }),
  ).toBeVisible();
});

test.describe("once the instance is set up", () => {
  let cookies: Map<string, string>;
  test.beforeAll(async () => {
    cookies = await finishSetup(["alice", "bob", "mallory"]);
  });

  const signedIn = async (browser: Browser, login: string) => {
    const context = await browser.newContext({ baseURL: INSTANCE_URL });
    await context.addCookies([
      {
        name: "orrery.session_token",
        value: cookies.get(login) ?? "",
        url: INSTANCE_URL,
      },
    ]);
    return { context, page: await context.newPage() };
  };

  test("a visitor without a session is sent to sign in, and the setup is gone", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(
      page.getByRole("button", { name: "Sign in with GitHub" }),
    ).toBeVisible();
    await page.goto("/setup");
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("a delivery with a wrong signature is refused and finds nothing", async ({
    request,
  }) => {
    const forged = signedDelivery(
      "installation",
      { action: "created" },
      "forged-1",
      "not-the-secret",
    );
    expect((await request.post("/api/webhooks/github", forged)).status()).toBe(
      401,
    );
  });

  test("a signed delivery makes the hub find the repository, and its tab appears", async ({
    browser,
    request,
  }) => {
    test.setTimeout(90_000);
    const { context, page } = await signedIn(browser, "alice");
    const delivery = signedDelivery(
      "installation",
      { action: "created" },
      "install-1",
    );
    expect(
      (await request.post("/api/webhooks/github", delivery)).status(),
    ).toBe(200);

    await expect
      .poll(
        async () => {
          await page.goto("/");
          // The redirect of a streamed page happens in the browser, a moment after the document arrives.
          await page
            .waitForURL(/\/p\//, { timeout: 5_000 })
            .catch(() => undefined);
          return new URL(page.url()).pathname;
        },
        { timeout: 60_000 },
      )
      .toBe("/p/acme/web/overview");

    await expect(
      page.getByRole("heading", { level: 1, name: "Starfall" }),
    ).toBeVisible();
    await expect(page.getByText("acme/web")).toBeVisible();
    await expect(page.getByText("Private", { exact: true })).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Projects" })
        .getByRole("link", { name: "Starfall" }),
    ).toHaveAttribute("aria-current", "page");
    await context.close();
  });

  test("the pages of a project are tabs, and the hub reopens where the user left", async ({
    browser,
  }) => {
    const { context, page } = await signedIn(browser, "alice");
    await page.goto("/p/acme/web");
    const pages = page.getByRole("navigation", { name: "Pages" });
    await expect(pages.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await pages.getByRole("link", { name: "Operations" }).click();
    await expect(page).toHaveURL(/\/p\/acme\/web\/ops$/);
    await expect
      .poll(async () =>
        (await context.cookies()).some(
          (c) =>
            c.name === "orrery_last" &&
            decodeURIComponent(c.value).endsWith("/ops"),
        ),
      )
      .toBe(true);

    await page.goto("/");
    await expect(page).toHaveURL(/\/p\/acme\/web\/ops$/);
    await context.close();
  });

  test("a page that is not in the file is a 404", async ({ browser }) => {
    const { context, page } = await signedIn(browser, "alice");
    await page.goto("/p/acme/web/nope");
    await expect(page.getByText("This page could not be found.")).toBeVisible();
    await context.close();
  });

  // The reference target is p95 < 1 s for a tab of 10 widgets served from cache, on a 2 vCPU / 4 GB machine (docs/scope.md, Performance).
  test("a tab of ten widgets, from cache, renders in under a second (p95)", async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const { context, page } = await signedIn(browser, "alice");
    const titles = Array.from({ length: 10 }, (_, i) => `P${i + 1}`);
    // Milliseconds from the start of the navigation to the first frame with all ten visible, read inside the page: an
    // assertion retried from here would only see it at its own steps (100, 350, 850 ms).
    const render = async () => {
      await page.goto("/p/acme/web/perf", { waitUntil: "commit" });
      const shown = await page.waitForFunction(
        (wanted) => {
          const leaves = [...document.querySelectorAll("body *")].filter((el) => el.childElementCount === 0 && el.checkVisibility());
          return wanted.every((title) => leaves.some((el) => el.textContent === title)) ? performance.now() : false;
        },
        titles,
      );
      return Math.round((await shown.jsonValue()) as number);
    };
    await render(); // the first visit fills the server cache and the browser's
    const samples: number[] = [];
    for (let i = 0; i < 20; i++) samples.push(await render());
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1];
    console.log(
      `[perf] ten widgets from cache: p50 ${samples[10]} ms, p95 ${p95} ms`,
    );
    expect(p95).toBeLessThan(1000);
    await context.close();
  });

  // The V1 "Done when" journeys (docs/scope.md) that need the whole instance.
  test("a source that is down fails in its own widget and leaves the others", async ({
    browser,
  }) => {
    const { context, page } = await signedIn(browser, "alice");
    await page.goto("/p/acme/web/down");
    await expect(
      page.getByRole("alert").filter({ hasText: "Gone" }),
    ).toContainText("ssrf_dns_failed");
    await expect(page.getByRole("link", { name: "v0.1.0 Release 1" })).toBeVisible();
    await context.close();
  });

  // A token made the way a user makes one: through the account page, shown once.
  const createToken = async (browser: Browser, login: string) => {
    const { context, page } = await signedIn(browser, login);
    await page.goto("/account/tokens");
    await page.getByLabel("Label").fill("agent");
    await page.getByRole("button", { name: "Create" }).click();
    const token = await page.locator("code", { hasText: /^orr_/ }).innerText();
    await context.close();
    return token;
  };
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const rpc = async (request: APIRequestContext, token: string, method: string, params?: object) => {
    const response = await request.post("/api/mcp", {
      headers: bearer(token),
      data: { jsonrpc: "2.0", id: 1, method, params },
    });
    expect(response.status()).toBe(200);
    return (await response.json()).result;
  };
  const tool = async (request: APIRequestContext, token: string, name: string, args: object = {}) => {
    const result = await rpc(request, token, "tools/call", { name, arguments: args });
    return { isError: result.isError, body: JSON.parse(result.content[0].text) };
  };

  test("an agent with a read-only token lists the projects and reads a widget through MCP", async ({
    browser,
    request,
  }) => {
    const alice = await createToken(browser, "alice");
    const { tools } = await rpc(request, alice, "tools/list");
    expect(tools.map((t: { name: string }) => t.name)).toEqual([
      "list_projects",
      "get_project",
      "read_widget",
      "explain_error",
      "validate_config",
    ]);

    const listed = await tool(request, alice, "list_projects");
    expect(listed.body.projects.map((p: { name: string }) => p.name).sort()).toEqual(["web", "zeta"]);

    const widget = { owner: "acme", repo: "web", page: "perf", index: 0 };
    const read = await tool(request, alice, "read_widget", widget);
    expect(read.isError).toBe(false);
    expect(read.body.trust).toBe("untrusted");
    expect(JSON.stringify(read.body.data)).toContain("Issue 1");

    // A member of the organization with no access to the repository gets nothing, and cannot tell the project exists.
    const bob = await createToken(browser, "bob");
    expect((await tool(request, bob, "list_projects")).body.projects).toEqual([]);
    const refused = await tool(request, bob, "read_widget", widget);
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused.body)).toContain("api_not_found");

    // Somebody outside the organization may not use the hub at all, whatever token they hold.
    const mallory = await createToken(browser, "mallory");
    const outsider = await request.post("/api/mcp", {
      headers: bearer(mallory),
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    expect(outsider.status()).toBe(401);
  });

  test("an invalid .hub.yml gives the same structured error in the CLI, the API, MCP and the UI", async ({
    browser,
    request,
  }) => {
    const file = "e2e/support/broken.hub.yml";
    expect(spawnSync(process.execPath, ["scripts/build-cli.mjs"]).status).toBe(0);
    const cli = spawnSync(process.execPath, ["dist/cli/orrery.cjs", "validate", "--json", file], { encoding: "utf8" });
    expect(cli.status).toBe(1);
    const { issues } = JSON.parse(cli.stdout);
    expect(issues).toEqual([
      {
        code: "config_unknown_source",
        path: expect.stringContaining("source"),
        line: expect.any(Number),
        message: expect.any(String),
        fix: expect.any(String),
      },
    ]);

    const token = await createToken(browser, "alice");
    const api = await request.get("/api/v1/projects/acme/zeta", { headers: bearer(token) });
    expect((await api.json()).issues).toEqual(issues);

    const yaml = readFileSync(file, "utf8");
    expect((await tool(request, token, "validate_config", { yaml })).body.issues).toEqual(issues);
    expect((await tool(request, token, "get_project", { owner: "acme", repo: "zeta" })).body.issues).toEqual(issues);

    const { context, page } = await signedIn(browser, "alice");
    await page.goto("/p/acme/zeta");
    const [{ code, path, line, message, fix }] = issues;
    const shown = page.getByRole("listitem").filter({ hasText: code });
    for (const part of [message, `${path}:${line}`, fix]) await expect(shown).toContainText(part);
    await context.close();
  });

  test("somebody GitHub gives no access to sees neither the tab nor the project", async ({
    browser,
  }) => {
    const { context, page } = await signedIn(browser, "mallory");
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "No projects yet" }),
    ).toBeVisible();
    await expect(page.getByText("Starfall")).toHaveCount(0);

    await page.goto("/p/acme/web");
    await expect(page.getByText("This page could not be found.")).toBeVisible();
    await expect(page.getByText("Starfall")).toHaveCount(0);
    await context.close();
  });
});
