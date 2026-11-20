import { describe, expect, it, vi } from "vitest";

const checkReadiness = vi.fn();
vi.mock("@/features/ops/server/check-readiness", () => ({ checkReadiness: (...a: unknown[]) => checkReadiness(...a) }));
vi.mock("@/lib/db/instance", () => ({ getDb: () => undefined }));

import { GET } from "./route";

describe("GET /readyz", () => {
  it("answers 200 when ready", async () => {
    checkReadiness.mockResolvedValue({ ready: true });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
  it("answers 503 with the reason when not ready, and is never cached", async () => {
    checkReadiness.mockResolvedValue({ ready: false, reason: "migrations_pending" });
    const res = await GET();
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ status: "unavailable", reason: "migrations_pending" });
  });
});
