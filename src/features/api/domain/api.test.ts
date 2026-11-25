import { describe, expect, it } from "vitest";
import { API_ERRORS, apiError } from "./errors";
import { openApiDocument } from "./openapi";
import { createRateLimiter } from "./rate-limit";

describe("API error catalog", () => {
  it("pins the released codes", () => expect(Object.keys(API_ERRORS)).toEqual(["api_unauthorized", "api_rate_limited", "api_not_found"]));
  it("answers with code, path, message and fix, uncached", async () => {
    const response = apiError("api_not_found", { "x-a": "1" });
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-a")).toBe("1");
    expect(await response.json()).toEqual({ errors: [{ code: "api_not_found", path: "", message: API_ERRORS.api_not_found.message, fix: API_ERRORS.api_not_found.fix }] });
  });
});

describe("rate limiter", () => {
  it("lets `limit` requests through per minute and per key, then says when to retry", () => {
    let t = 0;
    const limiter = createRateLimiter({ limit: 2, now: () => t });
    expect(limiter.take("a")).toEqual({ ok: true });
    expect(limiter.take("a")).toEqual({ ok: true });
    t = 45_000;
    expect(limiter.take("a")).toEqual({ ok: false, retryAfter: 15 });
    expect(limiter.take("b")).toEqual({ ok: true });
    t = 59_999;
    expect(limiter.take("a")).toEqual({ ok: false, retryAfter: 1 });
    t = 60_000;
    expect(limiter.take("a")).toEqual({ ok: true });
  });
  it("defaults to 600 per minute", () => {
    const limiter = createRateLimiter({ now: () => 0 });
    for (let i = 0; i < 600; i++) expect(limiter.take("k").ok).toBe(true);
    expect(limiter.take("k").ok).toBe(false);
  });
  it("uses the clock by default", () => expect(createRateLimiter().take("x")).toEqual({ ok: true }));
});

describe("OpenAPI document", () => {
  it("describes the three read routes and every $ref resolves", () => {
    expect(Object.keys(openApiDocument.paths)).toHaveLength(3);
    const refs = [...JSON.stringify(openApiDocument).matchAll(/"\$ref":"#\/components\/schemas\/(\w+)"/g)].map((m) => m[1]);
    for (const name of refs) expect(Object.keys(openApiDocument.components.schemas)).toContain(name);
  });
});
