import { describe, expect, it } from "vitest";
import { isHostBound, isValidSecretValue, MAX_SECRET_LENGTH, normalizeHost, SECRET_NAME, validateSecretInput } from "./bindings";

describe("SECRET_NAME", () => {
  it.each(["TOKEN", "GAME_API_TOKEN", "A", "A1_B2", "A".repeat(64)])("accepts %s", (name) => expect(SECRET_NAME.test(name)).toBe(true));
  it.each(["", "token", "1TOKEN", "_TOKEN", "TO-KEN", "TO KEN", "TOKEN}", "A".repeat(65), "TOKEN\n"])("refuses %j", (name) =>
    expect(SECRET_NAME.test(name)).toBe(false),
  );
});

describe("isValidSecretValue", () => {
  it("accepts printable text, spaces and unicode", () => expect(isValidSecretValue("Bearer abc 123 é")).toBe(true));
  it("accepts the maximum length and refuses one more", () => {
    expect(isValidSecretValue("a".repeat(MAX_SECRET_LENGTH))).toBe(true);
    expect(isValidSecretValue("a".repeat(MAX_SECRET_LENGTH + 1))).toBe(false);
  });
  it.each(["", "a\nb", "a\rb", "a\0b", "a\x1fb", "a\x7fb", "tab\there"])("refuses %j", (value) => expect(isValidSecretValue(value)).toBe(false));
});

describe("normalizeHost", () => {
  it.each([
    ["api.example.com", "api.example.com"],
    ["API.Example.COM", "api.example.com"],
    ["bücher.de", "xn--bcher-kva.de"],
    ["192.168.1.10", "192.168.1.10"],
    ["localhost", "localhost"],
    ["api.example.com:443", "api.example.com"],
    ["[::1]", "[::1]"],
  ])("normalizes %s", (input, expected) => expect(normalizeHost(input)).toBe(expected));
  it.each([
    "",
    " ",
    "https://api.example.com",
    "api.example.com/path",
    "api.example.com?x=1",
    "api.example.com#frag",
    "user@api.example.com",
    "api.example.com:8080",
    "*.example.com",
    "api.example.com\\x",
    "api example.com",
    "api.example.com\n",
    "exa<mple.com",
    ":443",
  ])("refuses %j", (input) => expect(normalizeHost(input)).toBeNull());
});

describe("isHostBound", () => {
  const bound = ["api.example.com", "xn--bcher-kva.de"];
  it("matches the exact host, whatever its case", () => {
    expect(isHostBound(bound, "api.example.com")).toBe(true);
    expect(isHostBound(bound, "API.EXAMPLE.COM")).toBe(true);
    expect(isHostBound(bound, "bücher.de")).toBe(true);
  });
  it.each(["example.com", "evil.api.example.com", "api.example.com.evil.com", "xapi.example.com", "api.example.com.", "", "api.example.com:8080", "https://api.example.com"])(
    "does not match %j",
    (host) => expect(isHostBound(bound, host)).toBe(false),
  );
  it("binds to nothing when the list is empty", () => expect(isHostBound([], "api.example.com")).toBe(false));
});

describe("validateSecretInput", () => {
  it("returns normalized, de-duplicated hosts", () => {
    expect(validateSecretInput({ name: "TOKEN", hosts: ["API.example.com", "api.example.com", "b.example.com"] })).toEqual({
      ok: true,
      hosts: ["api.example.com", "b.example.com"],
    });
  });
  it("reports every problem with its path and code", () => {
    const result = validateSecretInput({ name: "bad name", hosts: ["ok.example.com", "*.example.com", "https://x.com"] });
    expect(result.ok).toBe(false);
    expect(result.ok ? [] : result.issues.map((i) => [i.code, i.path])).toEqual([
      ["secret_invalid_name", "name"],
      ["secret_invalid_host", "hosts[1]"],
      ["secret_invalid_host", "hosts[2]"],
    ]);
    expect(result.ok ? [] : result.issues.map((i) => i.message)).toEqual(["Invalid secret name", "Not a bare host name", "Not a bare host name"]);
  });
  it("requires at least one host", () => {
    const result = validateSecretInput({ name: "TOKEN", hosts: [] });
    expect(result).toMatchObject({ ok: false, issues: [{ code: "secret_invalid_host", path: "hosts", message: "Bind the secret to at least one host" }] });
  });
});
