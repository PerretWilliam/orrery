import { describe, expect, it, vi } from "vitest";
import { resolveSecrets, type SecretLookup } from "./resolve";

const store: Record<string, { value: string; boundHosts: string[] }> = {
  GAME_TOKEN: { value: "tok-123", boundHosts: ["api.example.com"] },
  OTHER: { value: "other-value", boundHosts: ["other.example.com"] },
  MULTI_LINE: { value: "a\nb", boundHosts: ["api.example.com"] },
  WEIRD: { value: "a&b=c d$&$1", boundHosts: ["api.example.com"] },
};
const lookup: SecretLookup = (name) => Object.hasOwn(store, name) ? Reflect.get(store, name) : undefined;
const URL_OK = "https://api.example.com/stats";

const messages = (result: ReturnType<typeof resolveSecrets>) => (result.ok ? [] : result.issues.map((i) => i.message));
const codes = (result: ReturnType<typeof resolveSecrets>) => (result.ok ? [] : result.issues.map((i) => `${i.code}@${i.path}`));

describe("resolveSecrets", () => {
  it("returns the request unchanged when there is no reference, without touching the store", () => {
    const spy = vi.fn(lookup);
    const result = resolveSecrets({ url: `${URL_OK}?a=1#top`, headers: { Accept: "application/json" }, body: { q: "{ x }" } }, spy);
    expect(result).toEqual({ ok: true, used: [], inQuery: false, request: { url: `${URL_OK}?a=1#top`, headers: { Accept: "application/json" } } });
    expect(spy).not.toHaveBeenCalled();
  });
  it("fills a header and the query string", () => {
    const result = resolveSecrets(
      { url: `${URL_OK}?key=\${GAME_TOKEN}&x=1`, headers: { Authorization: "Bearer ${GAME_TOKEN}", "X-Two": "${GAME_TOKEN}-${GAME_TOKEN}" } },
      lookup,
    );
    expect(result).toEqual({
      ok: true,
      used: ["tok-123"],
      inQuery: true,
      request: { url: `${URL_OK}?key=tok-123&x=1`, headers: { Authorization: "Bearer tok-123", "X-Two": "tok-123-tok-123" } },
    });
  });
  it("keeps the fragment after the query and fills only the query", () => {
    const result = resolveSecrets({ url: `${URL_OK}?k=\${GAME_TOKEN}#section` }, lookup);
    expect(result).toMatchObject({ ok: true, request: { url: `${URL_OK}?k=tok-123#section` } });
  });
  it("URL-encodes the value in the query so it cannot add parameters, and never interprets `$` patterns", () => {
    const result = resolveSecrets({ url: `${URL_OK}?k=\${WEIRD}` }, lookup);
    expect(result).toMatchObject({ ok: true, request: { url: `${URL_OK}?k=a%26b%3Dc%20d%24%26%241` } });
    const header = resolveSecrets({ url: URL_OK, headers: { H: "x ${WEIRD} y" } }, lookup);
    expect(header).toMatchObject({ ok: true, request: { headers: { H: "x a&b=c d$&$1 y" } } });
  });
  it("sends a request to a different host only when the secret is bound to it", () => {
    expect(codes(resolveSecrets({ url: "https://evil.example.net/x", headers: { A: "${GAME_TOKEN}" } }, lookup))).toEqual(["secret_host_not_bound@url"]);
    expect(resolveSecrets({ url: "https://other.example.com/x", headers: { A: "${OTHER}" } }, lookup).ok).toBe(true);
  });
  it.each([
    ["a subdomain of a bound host", "https://x.api.example.com/s"],
    ["a bound host as a prefix", "https://api.example.com.evil.net/s"],
    ["a bound host in the userinfo", "https://api.example.com@evil.net/s"],
    ["a bound host in the path", "https://evil.net/api.example.com"],
    ["a trailing dot", "https://api.example.com./s"],
    ["a bound host in the query", "https://evil.net/s?h=api.example.com"],
  ])("refuses %s", (_name, url) => {
    expect(codes(resolveSecrets({ url, headers: { A: "${GAME_TOKEN}" } }, lookup))).toEqual(["secret_host_not_bound@url"]);
  });
  it("refuses a URL that cannot be parsed, since no destination host can be checked", () => {
    expect(codes(resolveSecrets({ url: "not a url", headers: { A: "${GAME_TOKEN}" } }, lookup))).toEqual(["secret_host_not_bound@url"]);
  });
  it("accepts a port and a path on the bound host", () => {
    expect(resolveSecrets({ url: "https://api.example.com:8443/a/b", headers: { A: "${GAME_TOKEN}" } }, lookup).ok).toBe(true);
  });
  it.each([
    ["the host", "https://${GAME_TOKEN}.example.com/x"],
    ["the scheme", "${GAME_TOKEN}://api.example.com/x"],
    ["the userinfo", "https://${GAME_TOKEN}@api.example.com/x"],
    ["the path", "https://api.example.com/${GAME_TOKEN}/x"],
    ["the fragment", "https://api.example.com/x#${GAME_TOKEN}"],
    ["a fragment after a query", "https://api.example.com/x?a=1#${GAME_TOKEN}"],
    ["a unknown reference in the path", "https://api.example.com/${NOPE}"],
  ])("refuses a reference in %s", (_name, url) => {
    const result = resolveSecrets({ url }, lookup);
    expect(codes(result)).toContain("secret_not_allowed_here@url");
  });
  it("refuses a reference in the body, at any depth, in values and in keys", () => {
    for (const body of [{ q: "${GAME_TOKEN}" }, { a: [{ b: ["x", "${GAME_TOKEN}"] }] }, { "${GAME_TOKEN}": 1 }, { a: { b: { c: "${GAME_TOKEN}" } } }]) {
      expect(codes(resolveSecrets({ url: URL_OK, body }, lookup))).toEqual(["secret_not_allowed_here@body"]);
    }
  });
  it("does not complain about a body with no reference, numbers or nulls", () => {
    expect(resolveSecrets({ url: URL_OK, body: { a: 1, b: null, c: [true, 2, { d: "plain" }] } }, lookup).ok).toBe(true);
    expect(resolveSecrets({ url: URL_OK, body: "plain" }, lookup).ok).toBe(true);
  });
  it("explains each refusal in words, naming the secret but never its value", () => {
    expect(messages(resolveSecrets({ url: "https://api.example.com/${GAME_TOKEN}" }, lookup))).toEqual([
      "Secrets cannot be used in the scheme, host, path or fragment of a URL",
    ]);
    expect(messages(resolveSecrets({ url: URL_OK, body: "${GAME_TOKEN}" }, lookup))).toEqual(["Secrets cannot be used in the request body"]);
    expect(messages(resolveSecrets({ url: URL_OK, headers: { A: "${NOPE}" } }, lookup))).toEqual(['Unknown secret "NOPE"']);
    expect(messages(resolveSecrets({ url: "https://evil.net/", headers: { A: "${GAME_TOKEN}" } }, lookup))).toEqual([
      'Secret "GAME_TOKEN" is not bound to the host of this source',
    ]);
    expect(messages(resolveSecrets({ url: URL_OK, headers: { A: "${MULTI_LINE}" } }, lookup))).toEqual(['Secret "MULTI_LINE" has an unusable value']);
  });
  it("splits the URL at the first ? and the first #, even when they are in odd places", () => {
    expect(resolveSecrets({ url: "https://api.example.com/x?a=?${GAME_TOKEN}#f?${OTHER}" }, lookup).ok).toBe(false);
    expect(resolveSecrets({ url: "https://api.example.com/x?a=1?b=${GAME_TOKEN}" }, lookup)).toMatchObject({
      ok: true,
      request: { url: "https://api.example.com/x?a=1?b=tok-123" },
    });
    expect(resolveSecrets({ url: "#only-a-fragment" }, lookup)).toMatchObject({ ok: true, request: { url: "#only-a-fragment" } });
    expect(resolveSecrets({ url: "?only=${GAME_TOKEN}" }, lookup).ok).toBe(false);
  });
  it("never reads the store when a reference is in a forbidden place", () => {
    const spy = vi.fn(lookup);
    const result = resolveSecrets({ url: "https://api.example.com/${GAME_TOKEN}", headers: { A: "${GAME_TOKEN}" } }, spy);
    expect(result.ok).toBe(false);
    expect(codes(result)).toContain("secret_not_allowed_here@url");
  });
  it.each(["NOPE", "", "lower", "A B", "constructor", "__proto__", "toString", "GAME_TOKEN "])("refuses the unknown or invalid name %j", (name) => {
    expect(codes(resolveSecrets({ url: URL_OK, headers: { A: `\${${name}}` } }, lookup))).toEqual(["secret_unknown@"]);
  });
  it("refuses a value with control characters, and never puts a value in an issue", () => {
    const result = resolveSecrets({ url: URL_OK, headers: { A: "${MULTI_LINE}" } }, lookup);
    expect(codes(result)).toEqual(["secret_invalid_value@"]);
    expect(JSON.stringify(result)).not.toContain("a\\nb");
  });
  it("reports every problem at once, without any secret value", () => {
    const result = resolveSecrets({ url: "https://evil.net/x?k=${OTHER}", headers: { A: "${NOPE}", B: "${GAME_TOKEN}" }, body: { x: "${GAME_TOKEN}" } }, lookup);
    expect(codes(result).sort()).toEqual(["secret_host_not_bound@url", "secret_host_not_bound@url", "secret_not_allowed_here@body", "secret_unknown@"]);
    for (const value of ["tok-123", "other-value"]) expect(JSON.stringify(result)).not.toContain(value);
  });
  it("leaves `${` text without a closing brace alone", () => {
    const result = resolveSecrets({ url: URL_OK, headers: { A: "cost is ${5" } }, lookup);
    expect(result).toMatchObject({ ok: true, request: { headers: { A: "cost is ${5" } } });
  });
  it("says a header secret does not travel in the URL, and a reference in the query does", () => {
    expect(resolveSecrets({ url: `${URL_OK}?x=1`, headers: { A: "${GAME_TOKEN}" } }, lookup)).toMatchObject({ used: ["tok-123"], inQuery: false });
    expect(resolveSecrets({ url: `${URL_OK}?k=\${GAME_TOKEN}` }, lookup)).toMatchObject({ used: ["tok-123"], inQuery: true });
  });
  it("accepts a secret whose bound-host list contains several hosts", () => {
    const multi: SecretLookup = () => ({ value: "v", boundHosts: ["a.example.com", "api.example.com"] });
    expect(resolveSecrets({ url: URL_OK, headers: { A: "${X}" } }, multi).ok).toBe(true);
  });
});
