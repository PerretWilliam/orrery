import { describe, expect, it } from "vitest";
import { APP_EVENTS, APP_PERMISSIONS, baseUrlFrom, buildManifest, parseConversion } from "./manifest";

describe("baseUrlFrom", () => {
  it("prefers ORRERY_PUBLIC_URL and keeps only its origin", () => {
    expect(baseUrlFrom({ publicUrl: "https://orrery.example.com/some/path?x=1", host: "evil.test" })).toBe("https://orrery.example.com");
    expect(baseUrlFrom({ publicUrl: "http://localhost:3000" })).toBe("http://localhost:3000");
  });
  it.each(["ftp://x.test", "javascript:alert(1)", "not a url", "file:///etc/passwd"])("refuses a public URL of %j", (publicUrl) => {
    expect(baseUrlFrom({ publicUrl, host: "localhost:3000" })).toBeNull();
  });
  it("falls back to the host of the request, with http unless the proxy said https", () => {
    expect(baseUrlFrom({ host: "localhost:3000" })).toBe("http://localhost:3000");
    expect(baseUrlFrom({ host: "orrery.example.com", proto: "https" })).toBe("https://orrery.example.com");
    expect(baseUrlFrom({ host: "orrery.example.com", proto: "ftp" })).toBe("http://orrery.example.com");
  });
  it.each([undefined, null, "", "evil.test/path", "evil.test@other.test", "a b", "-bad.test", "bad.test-", "x.test:123456", "x.test:", "<script>", "evil.test\\x"])(
    "refuses the host %j",
    (host) => expect(baseUrlFrom({ host })).toBeNull(),
  );
  it("accepts a single-label host and an IPv4 address with a port", () => {
    expect(baseUrlFrom({ host: "orrery" })).toBe("http://orrery");
    expect(baseUrlFrom({ host: "10.0.0.5:8080" })).toBe("http://10.0.0.5:8080");
  });
});

describe("buildManifest", () => {
  const manifest = buildManifest("https://orrery.example.com", true);
  it("points every URL at the instance", () => {
    expect(manifest).toMatchObject({
      name: "Orrery",
      url: "https://orrery.example.com",
      redirect_url: "https://orrery.example.com/setup/github/callback",
      callback_urls: ["https://orrery.example.com/api/auth/callback/github"],
      hook_attributes: { url: "https://orrery.example.com/api/webhooks/github", active: true },
      public: false,
    });
  });
  it("requests the six read-only permissions of the scope, and nothing else", () => {
    expect(manifest.default_permissions).toEqual({
      metadata: "read",
      contents: "read",
      issues: "read",
      pull_requests: "read",
      actions: "read",
      members: "read",
    });
    expect(Object.values(APP_PERMISSIONS).every((level) => level === "read")).toBe(true);
  });
  it("subscribes to the permission-related events and push", () => {
    expect([...APP_EVENTS].sort()).toEqual(["member", "membership", "organization", "push", "repository", "team"]);
    expect(manifest.default_events).toEqual(APP_EVENTS);
  });
  it("turns webhooks off when GitHub cannot reach the instance", () => {
    expect(buildManifest("http://localhost:3000", false).hook_attributes.active).toBe(false);
  });
});

describe("parseConversion", () => {
  const valid = { id: 123, slug: "orrery-x1", client_id: "Iv1.abc", client_secret: "cs", webhook_secret: "ws", pem: "-----BEGIN-----", owner: { login: "me" }, extra: 1 };
  it("maps GitHub's answer and ignores extra fields", () => {
    expect(parseConversion(valid)).toEqual({
      id: "123",
      slug: "orrery-x1",
      clientId: "Iv1.abc",
      clientSecret: "cs",
      webhookSecret: "ws",
      privateKey: "-----BEGIN-----",
    });
  });
  it.each([
    ["not an object", "oops"],
    ["null", null],
    ["no id", { ...valid, id: undefined }],
    ["string id", { ...valid, id: "123" }],
    ["negative id", { ...valid, id: -1 }],
    ["fractional id", { ...valid, id: 1.5 }],
    ["no slug", { ...valid, slug: undefined }],
    ["slug with a slash", { ...valid, slug: "a/b" }],
    ["empty slug", { ...valid, slug: "" }],
    ["slug too long", { ...valid, slug: "a".repeat(101) }],
    ["empty client id", { ...valid, client_id: "" }],
    ["no client secret", { ...valid, client_secret: undefined }],
    ["no webhook secret", { ...valid, webhook_secret: undefined }],
    ["no key", { ...valid, pem: "" }],
  ])("refuses %s", (_name, json) => expect(parseConversion(json)).toBeNull());
});
