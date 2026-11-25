import { describe, expect, it } from "vitest";
import { CONTENT_SECURITY_POLICY } from "./csp";

const directives = new Map(CONTENT_SECURITY_POLICY.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1)]));

describe("Content-Security-Policy", () => {
  it("allows only this origin by default, with no plug-ins, frames or foreign base", () => {
    expect(directives.get("default-src")).toEqual(["'self'"]);
    expect(directives.get("object-src")).toEqual(["'none'"]);
    expect(directives.get("base-uri")).toEqual(["'self'"]);
    expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
  });
  it("loads scripts and talks to this origin only, never eval and never a remote host", () => {
    expect(directives.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(directives.get("connect-src")).toEqual(["'self'"]);
    expect(directives.get("img-src")).toEqual(["'self'", "data:"]);
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/unsafe-eval|https?:|\*/);
  });
  it("leaves form-action out, so the sign-in post can be redirected to GitHub", () => {
    expect(directives.has("form-action")).toBe(false);
  });
});
