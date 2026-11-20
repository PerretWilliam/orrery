import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Harness smoke tests: proves Testcontainers (Postgres) and MSW work in CI.
// Real integration tests (data proxy, webhooks, GitHub mocks) build on this.
describe("Postgres via Testcontainers", () => {
  it("answers a query", async () => {
    const container = await new PostgreSqlContainer("postgres:17-alpine").start();
    try {
      const r = await container.exec(["psql", "-U", container.getUsername(), "-d", container.getDatabase(), "-tAc", "select 1"]);
      expect(r.output.trim()).toBe("1");
    } finally {
      await container.stop();
    }
  });
});

describe("MSW", () => {
  const server = setupServer(http.get("https://api.example.test/ping", () => HttpResponse.json({ ok: true })));
  beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
  afterAll(() => server.close());

  it("mocks outbound fetch", async () => {
    const res = await fetch("https://api.example.test/ping");
    expect(await res.json()).toEqual({ ok: true });
  });
});
