import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import {
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer as createHttpServer,
} from "node:http";
import { createServer as createHttpsServer } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SourceError } from "../domain/source-error";
import { fetchSource } from "../domain/fetch-source";
import { MAX_RESPONSE_BYTES } from "../domain/limits";
import { type Resolver, type SsrfRequest, SsrfError } from "@/lib/ssrf-guard";
import { createNodeSend } from "./transport";

type Handler = (req: IncomingMessage, res: ServerResponse) => void;
let handler: Handler = (_req, res) => res.end();
let plain: Server;
let secure: Server;
let plainPort: number;
let securePort: number;
let cert: string;
let dir: string;

const listen = (server: Server) =>
  new Promise<number>((done) => {
    server.listen(0, "127.0.0.1", () =>
      done((server.address() as AddressInfo).port),
    );
  });

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "orrery-tls-"));
  const key = join(dir, "key.pem");
  const crt = join(dir, "cert.pem");
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      key,
      "-out",
      crt,
      "-days",
      "1",
      "-subj",
      "/CN=pinned.test",
      "-addext",
      "subjectAltName=DNS:pinned.test",
    ],
    {
      stdio: "ignore",
    },
  );
  cert = readFileSync(crt, "utf8");
  const route: Handler = (req, res) => handler(req, res);
  plain = createHttpServer(route);
  secure = createHttpsServer({ key: readFileSync(key), cert }, route);
  [plainPort, securePort] = await Promise.all([listen(plain), listen(secure)]);
});
afterAll(async () => {
  plain.closeAllConnections();
  secure.closeAllConnections();
  await Promise.all([
    new Promise((done) => plain.close(done)),
    new Promise((done) => secure.close(done)),
  ]);
  rmSync(dir, { recursive: true, force: true });
});

const send = createNodeSend();
const request = (over: Partial<SsrfRequest> = {}): SsrfRequest => ({
  url: new URL(`http://pinned.test:${plainPort}/path?x=1`),
  address: "127.0.0.1",
  family: 4,
  method: "GET",
  headers: {},
  ...over,
});
/** Resolves `pinned.test` to loopback, which only an admin entry can open. */
const resolve: Resolver = async (host) => {
  if (host === "pinned.test") return ["127.0.0.1"];
  throw new Error("ENOTFOUND");
};
const admin = { adminAllow: ["pinned.test"] };
const jsonHeaders = { "content-type": "application/json" };
const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error instanceof SourceError || error instanceof SsrfError
      ? error.code
      : `other:${String(error)}`;
  }
  return "none";
};

describe("createNodeSend over http", () => {
  it("connects to the pinned address while keeping the name in the Host header", async () => {
    let seen = { host: "", method: "", url: "" };
    handler = (req, res) => {
      seen = {
        host: String(req.headers.host),
        method: String(req.method),
        url: String(req.url),
      };
      res
        .writeHead(200, { "content-type": "application/json", "x-one": "1" })
        .end('{"ok":true}');
    };
    const response = await send(request());
    expect(seen).toEqual({
      host: `pinned.test:${plainPort}`,
      method: "GET",
      url: "/path?x=1",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-one")).toBe("1");
    expect(await response.json()).toEqual({ ok: true });
  });
  it("never resolves the name again: an address that DNS does not know works", async () => {
    handler = (_req, res) => res.end("x");
    await expect(
      send(
        request({
          url: new URL(`http://does-not-exist.invalid:${plainPort}/`),
        }),
      ),
    ).resolves.toBeInstanceOf(Response);
  });
  it("sends the method, the headers and the body", async () => {
    let seen = { method: "", type: "", body: "", custom: "" };
    handler = (req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        seen = {
          method: String(req.method),
          type: String(req.headers["content-type"]),
          body: Buffer.concat(chunks).toString(),
          custom: String(req.headers["x-api-key"]),
        };
        res.end();
      });
    };
    await send(
      request({
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": "k" },
        body: '{"q":1}',
      }),
    );
    expect(seen).toEqual({
      method: "POST",
      type: "application/json",
      body: '{"q":1}',
      custom: "k",
    });
  });
  it("does not ask for compression", async () => {
    let encoding: string | string[] | undefined = "unset";
    handler = (req, res) => {
      encoding = req.headers["accept-encoding"];
      res.end();
    };
    await send(request());
    expect(encoding).toBeUndefined();
  });
  it("returns redirects instead of following them", async () => {
    handler = (_req, res) =>
      res.writeHead(302, { location: "http://127.0.0.1:1/" }).end();
    const response = await send(request());
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://127.0.0.1:1/");
  });
  it("keeps repeated headers", async () => {
    handler = (_req, res) =>
      res
        .writeHead(200, [
          ["Set-Cookie", "a=1"],
          ["Set-Cookie", "b=2"],
        ])
        .end();
    const response = await send(request());
    expect(response.headers.getSetCookie()).toEqual(["a=1", "b=2"]);
  });
  it.each([204, 304])("gives no body to a %i answer", async (status) => {
    handler = (_req, res) => res.writeHead(status).end();
    const response = await send(request());
    expect(response.status).toBe(status);
    expect(response.body).toBeNull();
  });
  it("returns error statuses as responses", async () => {
    handler = (_req, res) => res.writeHead(500).end("no");
    expect((await send(request())).status).toBe(500);
  });
  it("rejects when nothing listens, and when the signal is aborted", async () => {
    await expect(
      send(request({ url: new URL("http://pinned.test:1/") })),
    ).rejects.toThrow();
    const controller = new AbortController();
    controller.abort();
    await expect(
      send(request({ signal: controller.signal })),
    ).rejects.toThrow();
  });
  it("does not pool sockets across requests", async () => {
    const ports = new Set<number>();
    handler = (req, res) => {
      ports.add(req.socket.remotePort as number);
      res.end("x");
    };
    await (await send(request())).text();
    await (await send(request())).text();
    expect(ports.size).toBe(2);
  });
});

describe("createNodeSend over https", () => {
  const secureSend = createNodeSend({
    get ca() {
      return cert;
    },
  });
  const secureRequest = (over: Partial<SsrfRequest> = {}) =>
    request({ url: new URL(`https://pinned.test:${securePort}/s`), ...over });
  it("checks the certificate against the name, not the pinned address", async () => {
    handler = (_req, res) => res.writeHead(200, jsonHeaders).end('"tls"');
    const response = await secureSend(secureRequest());
    expect(await response.json()).toBe("tls");
  });
  it("refuses a certificate that does not match the name", async () => {
    handler = (_req, res) => res.end("x");
    await expect(
      secureSend(
        secureRequest({ url: new URL(`https://other.test:${securePort}/`) }),
      ),
    ).rejects.toThrow();
  });
  it("refuses an untrusted certificate", async () => {
    handler = (_req, res) => res.end("x");
    await expect(send(secureRequest())).rejects.toThrow();
  });
});

describe("fetchSource over a real connection", () => {
  const run = (
    path = "/",
    deps: { timeoutMs?: number; maxBytes?: number } = {},
    init = {},
  ) =>
    fetchSource(`http://pinned.test:${plainPort}${path}`, init, admin, {
      resolve,
      send,
      ...deps,
    });

  it("returns the JSON of an admin-allowed private host", async () => {
    handler = (_req, res) =>
      res.writeHead(200, jsonHeaders).end('{"value":42}');
    expect((await run()).data).toEqual({ value: 42 });
  });
  it("keeps loopback closed without the admin entry", async () => {
    handler = (_req, res) => res.writeHead(200, jsonHeaders).end("{}");
    expect(
      await codeOf(
        fetchSource(
          `http://pinned.test:${plainPort}/`,
          {},
          {},
          { resolve, send },
        ),
      ),
    ).toBe("ssrf_address_blocked");
    expect(
      await codeOf(
        fetchSource(
          `http://pinned.test:${plainPort}/`,
          {},
          { projectAllow: ["pinned.test"] },
          { resolve, send },
        ),
      ),
    ).toBe("ssrf_address_blocked");
  });
  it("refuses a body that is too large because it says so", async () => {
    handler = (_req, res) =>
      res
        .writeHead(200, {
          ...jsonHeaders,
          "content-length": String(MAX_RESPONSE_BYTES + 1),
        })
        .end(Buffer.alloc(MAX_RESPONSE_BYTES + 1, 97));
    expect(await codeOf(run())).toBe("source_too_large");
  });
  it("refuses a huge body that does not say its size, and closes the connection early", async () => {
    let closedAfter = Infinity;
    handler = (_req, res) => {
      res.writeHead(200, jsonHeaders);
      let sent = 0;
      const chunk = Buffer.alloc(256 * 1024, 97);
      const tick = () => {
        while (!res.destroyed && sent < 100 * 1024 * 1024) {
          sent += chunk.length;
          if (!res.write(chunk)) return void res.once("drain", tick);
        }
      };
      res.on("close", () => (closedAfter = sent));
      tick();
    };
    expect(await codeOf(run())).toBe("source_too_large");
    await new Promise((done) => setTimeout(done, 100));
    expect(closedAfter).toBeLessThan(40 * 1024 * 1024);
  });
  it("cuts a slow body at the deadline and closes the connection", async () => {
    let closed = false;
    handler = (_req, res) => {
      res.writeHead(200, jsonHeaders);
      res.write('{"a":');
      res.on("close", () => (closed = true));
    };
    const started = Date.now();
    expect(await codeOf(run("/", { timeoutMs: 150 }))).toBe("source_timeout");
    expect(Date.now() - started).toBeLessThan(1500);
    await new Promise((done) => setTimeout(done, 100));
    expect(closed).toBe(true);
  });
  it("cuts a server that never answers", async () => {
    handler = () => undefined;
    expect(await codeOf(run("/", { timeoutMs: 150 }))).toBe("source_timeout");
  });
  it("trickles: a body sent byte by byte is still cut by the total deadline", async () => {
    handler = (_req, res) => {
      res.writeHead(200, jsonHeaders);
      const timer = setInterval(() => res.write(" "), 20);
      res.on("close", () => clearInterval(timer));
    };
    expect(await codeOf(run("/", { timeoutMs: 200 }))).toBe("source_timeout");
  });
  it("refuses the wrong content type", async () => {
    handler = (_req, res) =>
      res.writeHead(200, { "content-type": "text/html" }).end("<html>");
    expect(await codeOf(run())).toBe("source_content_type");
  });
  it("refuses an error status", async () => {
    handler = (_req, res) => res.writeHead(502, jsonHeaders).end("{}");
    expect(await codeOf(run())).toBe("source_bad_status");
  });
  it("does not decompress: a gzip answer is not JSON", async () => {
    handler = (_req, res) =>
      res
        .writeHead(200, { ...jsonHeaders, "content-encoding": "gzip" })
        .end(Buffer.from([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3]));
    expect(await codeOf(run())).toBe("source_invalid_json");
  });
  it("follows a redirect to the same allowed host and revalidates it", async () => {
    handler = (req, res) =>
      req.url === "/start"
        ? res.writeHead(302, { location: "/end" }).end()
        : res.writeHead(200, jsonHeaders).end('"end"');
    expect((await run("/start")).data).toBe("end");
  });
  it("never reaches an internal address through a redirect", async () => {
    let hits = 0;
    const internal = createHttpServer((_req, res) => {
      hits++;
      res.writeHead(200, jsonHeaders).end('"secret"');
    });
    const internalPort = await listen(internal);
    handler = (_req, res) =>
      res
        .writeHead(302, { location: `http://127.0.0.1:${internalPort}/` })
        .end();
    try {
      expect(await codeOf(run())).toBe("ssrf_address_blocked");
      expect(hits).toBe(0);
    } finally {
      await new Promise((done) => internal.close(done));
    }
  });
  it("reports a closed port as unreachable", async () => {
    expect(
      await codeOf(
        fetchSource("http://pinned.test:1/", {}, admin, { resolve, send }),
      ),
    ).toBe("source_unreachable");
  });
  it("sends a static JSON body with POST", async () => {
    let body = "";
    handler = (req, res) => {
      req.on("data", (c: Buffer) => (body += c.toString()));
      req.on("end", () => res.writeHead(200, jsonHeaders).end('{"echo":true}'));
    };
    const result = await run(
      "/",
      {},
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"query":"{ x }"}',
      },
    );
    expect(result.data).toEqual({ echo: true });
    expect(body).toBe('{"query":"{ x }"}');
  });
});
