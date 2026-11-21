import { expect, test } from "@playwright/test";
import { finishSetup, INSTANCE_URL, resetInstance, SETUP_TOKEN, signedDelivery } from "./support/instance";

// The critical journeys of a real instance: production build, Postgres, and a fake GitHub behind the real adapter.
// One server and one database for the whole file, so the journeys run in order.
test.describe.configure({ mode: "serial" });

test.beforeAll(resetInstance);

test("a new instance sends the first visitor to the setup, which asks for the token", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByText("Set up Orrery", { exact: true })).toBeVisible();

  await page.getByLabel("Setup token").fill("not-the-token");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Something went wrong")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create the GitHub App" })).toHaveCount(0);

  await page.getByLabel("Setup token").fill(SETUP_TOKEN);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: "Create the GitHub App" })).toBeVisible();
});

test.describe("once the instance is set up", () => {
  let cookies: Map<string, string>;
  test.beforeAll(async () => {
    cookies = await finishSetup(["alice", "mallory"]);
  });

  const signedIn = async (browser: import("@playwright/test").Browser, login: string) => {
    const context = await browser.newContext({ baseURL: INSTANCE_URL });
    await context.addCookies([{ name: "orrery.session_token", value: cookies.get(login) ?? "", url: INSTANCE_URL }]);
    return { context, page: await context.newPage() };
  };

  test("a visitor without a session is sent to sign in, and the setup is gone", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("button", { name: "Sign in with GitHub" })).toBeVisible();
    await page.goto("/setup");
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("a delivery with a wrong signature is refused and finds nothing", async ({ request }) => {
    const forged = signedDelivery("installation", { action: "created" }, "forged-1", "not-the-secret");
    expect((await request.post("/api/webhooks/github", forged)).status()).toBe(401);
  });

  test("a signed delivery makes the hub find the repository, and its tab appears", async ({ browser, request }) => {
    const { context, page } = await signedIn(browser, "alice");
    const delivery = signedDelivery("installation", { action: "created" }, "install-1");
    expect((await request.post("/api/webhooks/github", delivery)).status()).toBe(200);

    await expect
      .poll(
        async () => {
          await page.goto("/");
          return new URL(page.url()).pathname;
        },
        { timeout: 60_000 },
      )
      .toBe("/p/acme/web/overview");

    await expect(page.getByRole("heading", { level: 1, name: "Starfall" })).toBeVisible();
    await expect(page.getByText("acme/web")).toBeVisible();
    await expect(page.getByText("Private", { exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Projects" }).getByRole("link", { name: "Starfall" })).toHaveAttribute("aria-current", "page");
    await context.close();
  });

  test("the pages of a project are tabs, and the hub reopens where the user left", async ({ browser }) => {
    const { context, page } = await signedIn(browser, "alice");
    await page.goto("/p/acme/web");
    await expect(page).toHaveURL(/\/p\/acme\/web\/overview$/);
    await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Operations" }).click();
    await expect(page).toHaveURL(/\/p\/acme\/web\/ops$/);
    await expect.poll(async () => (await context.cookies()).some((c) => c.name === "orrery_last")).toBe(true);

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

  test("somebody GitHub gives no access to sees neither the tab nor the project", async ({ browser }) => {
    const { context, page } = await signedIn(browser, "mallory");
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "No projects yet" })).toBeVisible();
    await expect(page.getByText("Starfall")).toHaveCount(0);

    await page.goto("/p/acme/web");
    await expect(page.getByText("This page could not be found.")).toBeVisible();
    await expect(page.getByText("Starfall")).toHaveCount(0);
    await context.close();
  });
});
