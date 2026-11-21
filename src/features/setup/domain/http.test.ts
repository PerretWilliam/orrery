import { describe, expect, it } from "vitest";
import { clearCookie, isSameOrigin, readCookie, setCookie } from "./http";

describe("setCookie", () => {
  it("is HttpOnly and SameSite=Lax, scoped and expiring", () => {
    expect(setCookie("a", "b", { maxAge: 60, path: "/setup", secure: false })).toBe("a=b; Path=/setup; Max-Age=60; HttpOnly; SameSite=Lax");
  });
  it("adds Secure over HTTPS", () => {
    expect(setCookie("a", "b", { maxAge: 60, path: "/", secure: true })).toBe("a=b; Path=/; Max-Age=60; HttpOnly; SameSite=Lax; Secure");
  });
  it("clears a cookie by expiring it at once", () => {
    expect(clearCookie("a", "/setup", true)).toBe("a=; Path=/setup; Max-Age=0; HttpOnly; SameSite=Lax; Secure");
  });
});

describe("readCookie", () => {
  it("finds a cookie among others, whatever the spacing", () => {
    expect(readCookie("x=1; orrery_setup=abc.def ;y=2", "orrery_setup")).toBe("abc.def");
    expect(readCookie("orrery_setup=a=b", "orrery_setup")).toBe("a=b");
  });
  it("does not match a longer or shorter name, nor a value", () => {
    expect(readCookie("xorrery_setup=1; orrery_setup2=2; other=orrery_setup=3", "orrery_setup")).toBeUndefined();
  });
  it.each([null, "", "novalue", "=x", ";;"])("returns undefined for %j", (header) => expect(readCookie(header, "a")).toBeUndefined());
  it("never reads a nameless cookie, nor a name cut short", () => {
    expect(readCookie("=x", "")).toBeUndefined();
    expect(readCookie("novalue", "novalu")).toBeUndefined();
  });
});

describe("isSameOrigin", () => {
  it("accepts the origin of the request's host", () => {
    expect(isSameOrigin("http://localhost:3000", "localhost:3000")).toBe(true);
    expect(isSameOrigin("https://orrery.example.com", "orrery.example.com")).toBe(true);
  });
  it.each([
    ["foreign origin", "https://evil.test", "orrery.example.com"],
    ["same name, other port", "http://orrery.example.com:81", "orrery.example.com"],
    ["no origin", null, "orrery.example.com"],
    ["unparsable origin", "null", "orrery.example.com"],
    ["no host", "https://orrery.example.com", null],
  ])("refuses %s", (_name, origin, host) => expect(isSameOrigin(origin, host)).toBe(false));
  it("compares with the public origin when one is configured, ignoring the host header", () => {
    expect(isSameOrigin("https://orrery.example.com", "internal:3000", "https://orrery.example.com")).toBe(true);
    expect(isSameOrigin("http://internal:3000", "internal:3000", "https://orrery.example.com")).toBe(false);
  });
});
