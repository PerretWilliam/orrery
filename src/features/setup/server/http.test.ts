// @vitest-environment node
import { describe, expect, it } from "vitest";
import { instanceOrigin, isSecure, redirectTo } from "./http";

describe("redirectTo", () => {
  it("is a 303 with a relative location, never cached, carrying every cookie", () => {
    const response = redirectTo("/setup?error=x", ["a=1; HttpOnly", "b=2; HttpOnly"]);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/setup?error=x");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.getSetCookie()).toEqual(["a=1; HttpOnly", "b=2; HttpOnly"]);
  });
  it("has no cookie by default", () => {
    expect(redirectTo("/").headers.getSetCookie()).toEqual([]);
  });
});

describe("instanceOrigin", () => {
  it("uses the host and forwarded protocol of the request", () => {
    expect(instanceOrigin(new Headers({ host: "orrery.test", "x-forwarded-proto": "https" }), undefined)).toBe("https://orrery.test");
  });
  it("prefers the configured public URL", () => {
    expect(instanceOrigin(new Headers({ host: "internal:3000" }), "https://orrery.example.com/x")).toBe("https://orrery.example.com");
  });
  it("reads ORRERY_PUBLIC_URL from the environment by default", () => {
    expect(instanceOrigin(new Headers({ host: "internal:3000" }))).toBe("http://internal:3000");
  });
  it("is null for an unusable host", () => {
    expect(instanceOrigin(new Headers({ host: "evil/path" }), undefined)).toBeNull();
  });
});

describe("isSecure", () => {
  it("is true only for https origins", () => {
    expect(isSecure("https://x.test")).toBe(true);
    expect(isSecure("http://x.test")).toBe(false);
    expect(isSecure(null)).toBe(false);
  });
});
