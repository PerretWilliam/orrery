import { describe, expect, it, vi } from "vitest";
import {
  type Resolver,
  type Send,
  type SsrfErrorCode,
  type SsrfPolicy,
  SsrfError,
  classifyAddress,
  compilePolicy,
  guardedFetch,
  parseAllowEntry,
  pinnedLookup,
  resolveTarget,
  systemResolve,
} from "./ssrf-guard";

const codeOf = async (
  promise: Promise<unknown>,
): Promise<SsrfErrorCode | "none" | "other"> => {
  try {
    await promise;
  } catch (error) {
    return error instanceof SsrfError ? error.code : "other";
  }
  return "none";
};

const PUBLIC = "93.184.216.34";
const dns =
  (table: Record<string, readonly string[]> = {}): Resolver =>
  async (host) => {
    const answer: readonly string[] | undefined = Reflect.get(table, host);
    if (!answer) throw new Error("ENOTFOUND");
    return answer;
  };
const target = (
  raw: string,
  policy: SsrfPolicy = {},
  resolve: Resolver = dns({ "example.com": [PUBLIC] }),
) => resolveTarget(raw, compilePolicy(policy), resolve);

describe("SsrfError", () => {
  it.each([
    ["ssrf_invalid_url", "valid absolute URL"],
    ["ssrf_scheme_blocked", "http and https"],
    ["ssrf_credentials_blocked", "user name"],
    ["ssrf_address_blocked", "private, internal or reserved"],
    ["ssrf_host_not_allowed", "allowlist"],
    ["ssrf_dns_failed", "resolved"],
    ["ssrf_too_many_redirects", "5 times"],
    ["ssrf_bad_redirect", "invalid redirect"],
  ] as const)("%s has a readable message", (code, words) => {
    const error = new SsrfError(code);
    expect(error).toMatchObject({ code, name: "SsrfError" });
    expect(error.message).toContain(words);
  });
});

describe("classifyAddress", () => {
  it.each([
    // IPv4: first and last address of every blocked range, and the public neighbours
    ["0.0.0.0", "private"],
    ["0.255.255.255", "private"],
    ["1.0.0.0", "public"],
    ["10.0.0.0", "private"],
    ["10.255.255.255", "private"],
    ["9.255.255.255", "public"],
    ["11.0.0.0", "public"],
    ["100.64.0.0", "private"],
    ["100.127.255.255", "private"],
    ["100.63.255.255", "public"],
    ["100.128.0.0", "public"],
    ["127.0.0.1", "private"],
    ["127.255.255.255", "private"],
    ["126.255.255.255", "public"],
    ["128.0.0.0", "public"],
    ["169.254.0.1", "private"],
    ["169.254.255.255", "private"],
    ["169.253.255.255", "public"],
    ["169.255.0.0", "public"],
    ["172.16.0.0", "private"],
    ["172.31.255.255", "private"],
    ["172.15.255.255", "public"],
    ["172.32.0.0", "public"],
    ["192.0.0.1", "private"],
    ["192.0.1.0", "public"],
    ["192.0.2.7", "private"],
    ["192.0.3.0", "public"],
    ["192.88.99.1", "private"],
    ["192.88.100.0", "public"],
    ["192.168.0.1", "private"],
    ["192.168.255.255", "private"],
    ["192.167.255.255", "public"],
    ["192.169.0.0", "public"],
    ["198.18.0.0", "private"],
    ["198.19.255.255", "private"],
    ["198.17.255.255", "public"],
    ["198.20.0.0", "public"],
    ["198.51.100.9", "private"],
    ["198.51.101.0", "public"],
    ["203.0.113.9", "private"],
    ["203.0.114.0", "public"],
    ["223.255.255.255", "public"],
    ["224.0.0.1", "private"],
    ["239.255.255.255", "private"],
    ["240.0.0.1", "private"],
    ["255.255.255.255", "private"],
    ["8.8.8.8", "public"],
    [PUBLIC, "public"],
    // IPv4 cloud metadata
    ["169.254.169.254", "metadata"],
    ["169.254.170.2", "metadata"],
    ["100.100.100.200", "metadata"],
    ["192.0.0.192", "metadata"],
    ["169.254.169.253", "private"],
    ["100.100.100.201", "private"],
    // IPv6
    ["::", "private"],
    ["::1", "private"],
    ["::7f00:1", "private"],
    ["::2:0:0", "public"],
    ["64:ff9b::7f00:1", "private"],
    ["64:ff9b:1::1", "public"],
    ["100::1", "private"],
    ["100:0:0:1::1", "public"],
    ["2001::1", "private"],
    ["2001:1::1", "public"],
    ["2001:db8::1", "private"],
    ["2001:db9::1", "public"],
    ["2002:7f00:1::", "private"],
    ["2003::1", "public"],
    ["fc00::1", "private"],
    ["fdff:ffff::1", "private"],
    ["fe00::1", "public"],
    ["fe80::1", "private"],
    ["febf::1", "private"],
    ["fec0::1", "private"],
    ["feff::1", "private"],
    ["ff02::1", "private"],
    ["fd00:ec2::254", "metadata"],
    ["fd00:ec2::253", "private"],
    ["2606:4700:4700::1111", "public"],
    ["2a00:1450:4001::1", "public"],
    // IPv4-mapped IPv6 follows the IPv4 rules, in both notations
    ["::ffff:127.0.0.1", "private"],
    ["::ffff:7f00:1", "private"],
    ["::ffff:10.1.2.3", "private"],
    ["::ffff:169.254.169.254", "metadata"],
    ["::ffff:8.8.8.8", "public"],
    // zone id, and things that are not addresses
    ["fe80::1%eth0", "private"],
    ["2606:4700:4700::1111%en0", "public"],
    ["", "invalid"],
    ["localhost", "invalid"],
    ["1.2.3", "invalid"],
    ["0177.0.0.1", "invalid"],
    ["999.1.1.1", "invalid"],
  ] as const)("%s is %s", (address, expected) => {
    expect(classifyAddress(address)).toBe(expected);
  });
});

describe("parseAllowEntry", () => {
  it.each([
    "nas.lan",
    " NAS.Lan ",
    "localhost",
    "a-b.example.com",
    "*.example.com",
    "*.lan",
    "10.0.0.5",
    "10.0.0.0/8",
    "10.0.0.0/32",
    "10.0.0.0/0",
    "fd00::/8",
    "fd00::1",
    "::1/128",
    "fd00::/128",
  ])("accepts %j", (entry) => {
    expect(parseAllowEntry(entry)).not.toBeNull();
  });
  it.each([
    "",
    " ",
    "*",
    "*.",
    "*.-bad.com",
    "*.a b.com",
    "-bad.com",
    "bad-.com",
    "a..b",
    "exa mple.com",
    "http://example.com",
    "example.com/24",
    "example.com:80",
    "10.0.0.0/33",
    "10.0.0.0/",
    "10.0.0.0/-1",
    "10.0.0.0/8/8",
    "10.0.0.0/abc",
    "10.0.0.0/1000",
    "fd00::/129",
    "10.0.0/8",
    `${"a".repeat(64)}.com`,
  ])("rejects %j", (entry) => {
    expect(parseAllowEntry(entry)).toBeNull();
  });
  it("accepts a name of 253 characters and refuses 254", () => {
    const name = (length: number) =>
      `${"a".repeat(63)}.`.repeat(3) + "a".repeat(length - 192);
    expect(parseAllowEntry(name(253))).not.toBeNull();
    expect(parseAllowEntry(name(254))).toBeNull();
  });
  it("keeps the lowercase name or suffix", () => {
    expect(parseAllowEntry(" NAS.Lan ")).toEqual({
      kind: "host",
      name: "nas.lan",
    });
    expect(parseAllowEntry("*.Example.COM")).toEqual({
      kind: "suffix",
      suffix: "example.com",
    });
  });
});

describe("compilePolicy", () => {
  it("is empty by default and without a project list", () => {
    expect(compilePolicy()).toEqual({ admin: [], project: null });
    expect(compilePolicy({ projectAllow: [] }).project).toBeNull();
  });
  it("skips invalid entries but keeps the restriction when a project list was given", () => {
    const policy = compilePolicy({
      adminAllow: ["nope!", "nas.lan"],
      projectAllow: ["nope!"],
    });
    expect(policy.admin).toHaveLength(1);
    expect(policy.project).toEqual([]);
  });
});

describe("resolveTarget: URL checks", () => {
  it.each(["", "not a url", "/relative", "http://", "http://[::1"])(
    "rejects the invalid URL %j",
    async (raw) => {
      expect(await codeOf(target(raw))).toBe("ssrf_invalid_url");
    },
  );
  it.each([
    "ftp://example.com/",
    "file:///etc/passwd",
    "gopher://example.com/",
    "javascript:alert(1)",
    "data:text/plain,hi",
    "ws://example.com/",
    "HTTPS-://example.com/",
  ])("rejects the scheme of %s", async (raw) => {
    expect(await codeOf(target(raw))).toMatch(
      /ssrf_(scheme_blocked|invalid_url)/,
    );
  });
  it("names the scheme error for a valid URL with another scheme", async () => {
    expect(await codeOf(target("ftp://example.com/"))).toBe(
      "ssrf_scheme_blocked",
    );
  });
  it.each([
    "http://user@example.com/",
    "http://user:pw@example.com/",
    "https://:pw@example.com/",
  ])("rejects credentials in %s", async (raw) => {
    expect(await codeOf(target(raw))).toBe("ssrf_credentials_blocked");
  });
  it("accepts http and https on a public host and returns the pinned address", async () => {
    for (const raw of [
      "http://example.com/a?b=1",
      "https://EXAMPLE.com:8443/a",
      "HTTPS://example.com",
    ]) {
      const result = await target(raw);
      expect(result).toMatchObject({
        host: "example.com",
        address: PUBLIC,
        family: 4,
      });
      expect(result.url).toBeInstanceOf(URL);
    }
  });
  it("accepts a URL object", async () => {
    expect((await target(String(new URL("https://example.com/")))).host).toBe(
      "example.com",
    );
  });
  it("ignores a trailing dot on the host name", async () => {
    expect(await target("https://example.com./")).toMatchObject({
      host: "example.com",
    });
  });
  it("sees the real host behind confusing userinfo or backslashes", async () => {
    expect(await codeOf(target("http://example.com@127.0.0.1/"))).toBe(
      "ssrf_credentials_blocked",
    );
    expect(await codeOf(target("http://127.0.0.1\\@example.com/"))).toBe(
      "ssrf_address_blocked",
    );
    expect(await codeOf(target("http://example.com#@127.0.0.1/"))).toBe("none");
  });
});

describe("resolveTarget: addresses written as literals", () => {
  it.each([
    "http://127.0.0.1/",
    "http://127.1/",
    "http://0.0.0.0/",
    "http://10.0.0.1/",
    "http://192.168.1.1/",
    "http://172.16.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://100.100.100.200/",
    "http://[::1]/",
    "http://[::]/",
    "http://[fe80::1]/",
    "http://[fc00::1]/",
    "http://[fd00:ec2::254]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:7f00:1]/",
    "http://[::ffff:169.254.169.254]/",
    "http://[64:ff9b::7f00:1]/",
    "http://[2002:7f00:1::]/",
    // decimal, octal, hexadecimal and mixed forms, which URL parsing turns into dotted decimal
    "http://2130706433/",
    "http://017700000001/",
    "http://0177.0.0.1/",
    "http://0177.0.0.01/",
    "http://0x7f.0.0.1/",
    "http://0x7f000001/",
    "http://0xA9FEA9FE/",
    "http://2852039166/",
    "http://0251.0376.0251.0376/",
    "http://127.000.000.001/",
  ])("blocks %s without any DNS query", async (raw) => {
    const resolve = vi.fn<Resolver>();
    expect(await codeOf(target(raw, {}, resolve))).toBe("ssrf_address_blocked");
    expect(resolve).not.toHaveBeenCalled();
  });
  it("lets a public literal through without any DNS query", async () => {
    const resolve = vi.fn<Resolver>();
    expect(await target(`http://${PUBLIC}:8080/`, {}, resolve)).toMatchObject({
      host: PUBLIC,
      address: PUBLIC,
      family: 4,
    });
    expect(
      await target("https://[2606:4700:4700::1111]/", {}, resolve),
    ).toMatchObject({ host: "2606:4700:4700::1111", family: 6 });
    expect(await target("http://[::ffff:8.8.8.8]/", {}, resolve)).toMatchObject(
      { family: 6 },
    );
    expect(resolve).not.toHaveBeenCalled();
  });
  it("blocks a decimal form of a public address only if it is not public", async () => {
    expect(await target("http://134744072/")).toMatchObject({
      host: "8.8.8.8",
    });
  });
});

describe("resolveTarget: names", () => {
  it("blocks a name that resolves to a private, loopback or link-local address", async () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.8",
      "192.168.0.8",
      "169.254.1.1",
      "::1",
      "fd12::1",
      "fe80::2",
      "::ffff:10.0.0.1",
    ]) {
      expect(
        await codeOf(
          target("http://evil.test/", {}, dns({ "evil.test": [address] })),
        ),
      ).toBe("ssrf_address_blocked");
    }
  });
  it("blocks metadata addresses resolved from a name", async () => {
    expect(
      await codeOf(
        target(
          "http://evil.test/",
          {},
          dns({ "evil.test": ["169.254.169.254"] }),
        ),
      ),
    ).toBe("ssrf_address_blocked");
  });
  it("blocks localhost, its subdomains and the trailing-dot form through resolution", async () => {
    const resolve = dns({
      localhost: ["127.0.0.1", "::1"],
      "app.localhost": ["127.0.0.1"],
    });
    for (const raw of [
      "http://localhost/",
      "http://LOCALHOST:3000/",
      "http://localhost./",
      "http://app.localhost/",
    ]) {
      expect(await codeOf(target(raw, {}, resolve))).toBe(
        "ssrf_address_blocked",
      );
    }
  });
  it.each([
    "metadata.google.internal",
    "metadata.goog",
    "instance-data",
    "instance-data.ec2.internal",
  ])("blocks the metadata name %s before resolving it", async (host) => {
    const resolve = vi.fn<Resolver>(async () => [PUBLIC]);
    expect(await codeOf(target(`http://${host}/`, {}, resolve))).toBe(
      "ssrf_address_blocked",
    );
    expect(
      await codeOf(
        target(
          `http://${host}./`,
          { adminAllow: [host, "*.internal", "0.0.0.0/0"] },
          resolve,
        ),
      ),
    ).toBe("ssrf_address_blocked");
    expect(resolve).not.toHaveBeenCalled();
  });
  it("blocks a name when any one of its addresses is internal (DNS rebinding with several answers)", async () => {
    const resolve = dns({ "rebind.test": [PUBLIC, "127.0.0.1"] });
    expect(await codeOf(target("http://rebind.test/", {}, resolve))).toBe(
      "ssrf_address_blocked",
    );
    expect(
      await codeOf(
        target(
          "http://rebind.test/",
          {},
          dns({ "rebind.test": ["127.0.0.1", PUBLIC] }),
        ),
      ),
    ).toBe("ssrf_address_blocked");
  });
  it("blocks an answer that is not an IP address", async () => {
    expect(
      await codeOf(
        target("http://weird.test/", {}, dns({ "weird.test": ["not-an-ip"] })),
      ),
    ).toBe("ssrf_address_blocked");
  });
  it("resolves once and pins the first answer", async () => {
    const resolve = vi
      .fn<Resolver>()
      .mockResolvedValueOnce(["2606:4700:4700::1111", PUBLIC])
      .mockResolvedValue(["127.0.0.1"]);
    const result = await target("https://example.com/", {}, resolve);
    expect(result).toMatchObject({
      address: "2606:4700:4700::1111",
      family: 6,
    });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith("example.com");
  });
  it("reports a family 4 pin for an IPv4 answer and 6 for a zoned IPv6 one", async () => {
    expect((await target("https://example.com/")).family).toBe(4);
    expect(
      (
        await target(
          "https://example.com/",
          {},
          dns({ "example.com": ["2606:4700:4700::1111%en0"] }),
        )
      ).family,
    ).toBe(6);
  });
  it("fails closed when the resolver throws or returns nothing", async () => {
    expect(await codeOf(target("http://nowhere.test/"))).toBe(
      "ssrf_dns_failed",
    );
    expect(
      await codeOf(
        target("http://nowhere.test/", {}, dns({ "nowhere.test": [] })),
      ),
    ).toBe("ssrf_dns_failed");
  });
});

describe("systemResolve", () => {
  it("returns the addresses of a name through the system resolver", async () => {
    const addresses = await systemResolve("localhost");
    expect(addresses.length).toBeGreaterThan(0);
    expect(addresses.every((a) => classifyAddress(a) === "private")).toBe(true);
  });
  it("rejects when the name does not exist", async () => {
    await expect(systemResolve("does-not-exist.invalid")).rejects.toThrow();
  });
});

describe("resolveTarget: admin allowlist", () => {
  const nas = dns({
    "nas.lan": ["192.168.1.20"],
    "other.lan": ["192.168.1.21"],
    "a.b.homelab.test": ["10.1.1.1"],
    "homelab.test": ["10.1.1.2"],
    "mixed.lan": ["192.168.1.20", "127.0.0.1"],
  });
  it("keeps private hosts blocked without an entry", async () => {
    expect(await codeOf(target("http://nas.lan/", {}, nas))).toBe(
      "ssrf_address_blocked",
    );
    expect(
      await codeOf(target("http://nas.lan/", { adminAllow: [] }, nas)),
    ).toBe("ssrf_address_blocked");
  });
  it("opens a private host by name, only that name", async () => {
    const policy = { adminAllow: ["nas.lan"] };
    expect(await target("http://nas.lan/", policy, nas)).toMatchObject({
      address: "192.168.1.20",
    });
    expect(await target("http://NAS.lan./", policy, nas)).toMatchObject({
      host: "nas.lan",
    });
    expect(await codeOf(target("http://other.lan/", policy, nas))).toBe(
      "ssrf_address_blocked",
    );
  });
  it("opens private hosts by wildcard suffix but not the bare domain", async () => {
    const policy = { adminAllow: ["*.homelab.test"] };
    expect(await target("http://a.b.homelab.test/", policy, nas)).toMatchObject(
      { address: "10.1.1.1" },
    );
    expect(await codeOf(target("http://homelab.test/", policy, nas))).toBe(
      "ssrf_address_blocked",
    );
    expect(
      await codeOf(
        target(
          "http://evilhomelab.test/",
          policy,
          dns({ "evilhomelab.test": ["10.1.1.1"] }),
        ),
      ),
    ).toBe("ssrf_address_blocked");
  });
  it("opens a private address or range", async () => {
    expect(
      await target("http://192.168.1.20/", { adminAllow: ["192.168.1.20"] }),
    ).toMatchObject({ address: "192.168.1.20" });
    expect(
      await target("http://nas.lan/", { adminAllow: ["192.168.0.0/16"] }, nas),
    ).toMatchObject({ address: "192.168.1.20" });
    expect(
      await target("http://[fd00::5]/", { adminAllow: ["fd00::/8"] }),
    ).toMatchObject({ family: 6 });
    expect(
      await codeOf(
        target("http://192.168.1.20/", { adminAllow: ["192.168.1.21"] }),
      ),
    ).toBe("ssrf_address_blocked");
    expect(
      await codeOf(
        target("http://10.1.1.20/", { adminAllow: ["192.168.0.0/16"] }),
      ),
    ).toBe("ssrf_address_blocked");
    expect(
      await codeOf(target("http://[fe80::5]/", { adminAllow: ["fd00::/8"] })),
    ).toBe("ssrf_address_blocked");
  });
  it("matches a range written for IPv4 against the mapped form of the address", async () => {
    expect(
      await target("http://[::ffff:192.168.1.20]/", {
        adminAllow: ["192.168.0.0/16"],
      }),
    ).toMatchObject({ family: 6 });
  });
  it("needs every answer to be allowed by a range, not just one", async () => {
    expect(
      await codeOf(
        target("http://mixed.lan/", { adminAllow: ["192.168.0.0/16"] }, nas),
      ),
    ).toBe("ssrf_address_blocked");
    expect(
      await target(
        "http://mixed.lan/",
        { adminAllow: ["192.168.0.0/16", "127.0.0.1"] },
        nas,
      ),
    ).toMatchObject({ address: "192.168.1.20" });
  });
  it("lets an entry for a name cover every private address that name resolves to", async () => {
    expect(
      await target("http://mixed.lan/", { adminAllow: ["mixed.lan"] }, nas),
    ).toMatchObject({ address: "192.168.1.20" });
  });
  it("never opens cloud metadata, whatever the entry", async () => {
    const policy = {
      adminAllow: [
        "169.254.0.0/16",
        "0.0.0.0/0",
        "::/0",
        "169.254.169.254",
        "evil.test",
      ],
    };
    expect(await codeOf(target("http://169.254.169.254/", policy))).toBe(
      "ssrf_address_blocked",
    );
    expect(
      await codeOf(
        target(
          "http://evil.test/",
          policy,
          dns({ "evil.test": ["169.254.169.254"] }),
        ),
      ),
    ).toBe("ssrf_address_blocked");
    expect(await codeOf(target("http://[fd00:ec2::254]/", policy))).toBe(
      "ssrf_address_blocked",
    );
  });
  it("does not let an entry turn an invalid answer into a valid one", async () => {
    expect(
      await codeOf(
        target(
          "http://weird.test/",
          { adminAllow: ["weird.test", "0.0.0.0/0"] },
          dns({ "weird.test": ["not-an-ip"] }),
        ),
      ),
    ).toBe("ssrf_address_blocked");
  });
  it("ignores an invalid entry instead of opening everything", async () => {
    expect(
      await codeOf(
        target(
          "http://nas.lan/",
          { adminAllow: ["192.168.0.0/99", "*", ""] },
          nas,
        ),
      ),
    ).toBe("ssrf_address_blocked");
  });
  it("is not needed for public hosts", async () => {
    expect(
      await target("https://example.com/", { adminAllow: ["nas.lan"] }),
    ).toMatchObject({ address: PUBLIC });
  });
});

describe("resolveTarget: project allowlist", () => {
  const dnsTable = dns({
    "example.com": [PUBLIC],
    "api.example.com": [PUBLIC],
    "nas.lan": ["192.168.1.20"],
    "other.com": ["8.8.8.8"],
  });
  it("is not a restriction when absent or empty", async () => {
    expect(await target("https://other.com/", {}, dnsTable)).toMatchObject({
      host: "other.com",
    });
    expect(
      await target("https://other.com/", { projectAllow: [] }, dnsTable),
    ).toMatchObject({ host: "other.com" });
  });
  it("restricts to the listed names and suffixes", async () => {
    const policy = { projectAllow: ["example.com", "*.example.com"] };
    expect(
      await target("https://example.com/", policy, dnsTable),
    ).toMatchObject({ host: "example.com" });
    expect(
      await target("https://api.example.com/", policy, dnsTable),
    ).toMatchObject({ host: "api.example.com" });
    expect(await codeOf(target("https://other.com/", policy, dnsTable))).toBe(
      "ssrf_host_not_allowed",
    );
  });
  it("restricts to listed ranges of public addresses", async () => {
    expect(
      await target(
        "https://other.com/",
        { projectAllow: ["8.8.8.0/24"] },
        dnsTable,
      ),
    ).toMatchObject({ address: "8.8.8.8" });
    expect(
      await codeOf(
        target(
          "https://example.com/",
          { projectAllow: ["8.8.8.0/24"] },
          dnsTable,
        ),
      ),
    ).toBe("ssrf_host_not_allowed");
  });
  it("blocks everything when the list holds only invalid entries", async () => {
    expect(
      await codeOf(
        target("https://example.com/", { projectAllow: ["???"] }, dnsTable),
      ),
    ).toBe("ssrf_host_not_allowed");
  });
  it("cannot open a private host, by name or by range, without the admin", async () => {
    expect(
      await codeOf(
        target("http://nas.lan/", { projectAllow: ["nas.lan"] }, dnsTable),
      ),
    ).toBe("ssrf_address_blocked");
    expect(
      await codeOf(
        target(
          "http://192.168.1.20/",
          { projectAllow: ["192.168.0.0/16"] },
          dnsTable,
        ),
      ),
    ).toBe("ssrf_address_blocked");
    expect(
      await codeOf(
        target(
          "http://127.0.0.1/",
          { projectAllow: ["127.0.0.1", "0.0.0.0/0"] },
          dnsTable,
        ),
      ),
    ).toBe("ssrf_address_blocked");
    expect(
      await codeOf(
        target(
          "http://169.254.169.254/",
          {
            projectAllow: ["169.254.169.254"],
            adminAllow: ["169.254.169.254"],
          },
          dnsTable,
        ),
      ),
    ).toBe("ssrf_address_blocked");
  });
  it("narrows the admin list: both must agree", async () => {
    const admin = ["nas.lan", "media.lan"];
    const table = dns({
      "nas.lan": ["192.168.1.20"],
      "media.lan": ["192.168.1.30"],
    });
    expect(
      await target(
        "http://nas.lan/",
        { adminAllow: admin, projectAllow: ["nas.lan"] },
        table,
      ),
    ).toMatchObject({ host: "nas.lan" });
    expect(
      await codeOf(
        target(
          "http://media.lan/",
          { adminAllow: admin, projectAllow: ["nas.lan"] },
          table,
        ),
      ),
    ).toBe("ssrf_host_not_allowed");
    expect(
      await codeOf(
        target(
          "http://nas.lan/",
          { adminAllow: ["media.lan"], projectAllow: ["nas.lan"] },
          table,
        ),
      ),
    ).toBe("ssrf_address_blocked");
  });
});

describe("pinnedLookup", () => {
  it("answers with the pinned address, in both callback shapes", () => {
    const callback = vi.fn();
    pinnedLookup("93.184.216.34", 4)("example.com", {}, callback);
    expect(callback).toHaveBeenLastCalledWith(null, "93.184.216.34", 4);
    pinnedLookup("2606:4700:4700::1111", 6)(
      "example.com",
      { all: true },
      callback,
    );
    expect(callback).toHaveBeenLastCalledWith(null, [
      { address: "2606:4700:4700::1111", family: 6 },
    ]);
  });
});

describe("guardedFetch", () => {
  const redirect = (
    status: number,
    location: string | null,
    body: string | null = null,
  ) =>
    new Response(body, {
      status,
      headers: location === null ? {} : { location },
    });
  const ok = (text = "ok") => new Response(text, { status: 200 });
  const resolve = dns({
    "example.com": [PUBLIC],
    "other.com": ["8.8.4.4"],
    "evil.test": ["10.0.0.1"],
    "nas.lan": ["192.168.1.20"],
    localhost: ["127.0.0.1"],
  });
  const scripted = (...responses: Response[]) => {
    const queue = [...responses];
    return vi.fn<Send>(async () => queue.shift() ?? ok());
  };
  const run = (raw: string, send: Send, init = {}, policy: SsrfPolicy = {}) =>
    guardedFetch(raw, init, policy, { resolve, send });

  it("sends the pinned address and the request, and returns the response and the final URL", async () => {
    const send = scripted(ok("hello"));
    const signal = new AbortController().signal;
    const result = await run("https://example.com/a", send, {
      method: "POST",
      headers: { "X-Key": "k" },
      body: "{}",
      signal,
    });
    expect(await result.response.text()).toBe("hello");
    expect(result.url.href).toBe("https://example.com/a");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      url: result.url,
      address: PUBLIC,
      family: 4,
      method: "POST",
      headers: { "X-Key": "k" },
      body: "{}",
      signal,
    });
  });
  it("defaults to a GET without headers or body", async () => {
    const send = scripted();
    await run("https://example.com/", send);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        headers: {},
        body: undefined,
        signal: undefined,
      }),
    );
  });
  it("never sends a blocked request", async () => {
    const send = scripted();
    expect(await codeOf(run("http://127.0.0.1/", send))).toBe(
      "ssrf_address_blocked",
    );
    expect(await codeOf(run("http://evil.test/", send))).toBe(
      "ssrf_address_blocked",
    );
    expect(send).not.toHaveBeenCalled();
  });
  it("follows a redirect to another public host", async () => {
    const send = scripted(redirect(302, "https://other.com/next"), ok("end"));
    const result = await run("https://example.com/", send);
    expect(result.url.href).toBe("https://other.com/next");
    expect(send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ address: "8.8.4.4" }),
    );
  });
  it("resolves relative redirects against the current URL", async () => {
    const send = scripted(redirect(301, "/b/c?x=1"), redirect(308, "d"), ok());
    expect((await run("https://example.com/a/z", send)).url.href).toBe(
      "https://example.com/b/d",
    );
  });
  it.each([301, 302, 303, 307, 308])("follows a %i", async (status) => {
    const send = scripted(redirect(status, "https://example.com/next"), ok());
    expect((await run("https://example.com/", send)).url.pathname).toBe(
      "/next",
    );
  });
  it.each([300, 304, 305, 306, 309, 200, 404, 500])(
    "does not follow a %i",
    async (status) => {
      const send = scripted(redirect(status, "http://127.0.0.1/"));
      expect((await run("https://example.com/", send)).response.status).toBe(
        status,
      );
      expect(send).toHaveBeenCalledTimes(1);
    },
  );
  it("returns a redirect that has no Location header", async () => {
    const send = scripted(redirect(302, null));
    expect((await run("https://example.com/", send)).response.status).toBe(302);
  });
  it("refuses a redirect to an internal address and never contacts it", async () => {
    for (const location of [
      "http://127.0.0.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://evil.test/",
      "http://2130706433/",
      "http://localhost/",
    ]) {
      const send = scripted(redirect(302, location));
      expect(await codeOf(run("https://example.com/", send))).toBe(
        "ssrf_address_blocked",
      );
      expect(send).toHaveBeenCalledTimes(1);
    }
  });
  it("refuses a redirect to another scheme", async () => {
    expect(
      await codeOf(
        run(
          "https://example.com/",
          scripted(redirect(302, "file:///etc/passwd")),
        ),
      ),
    ).toBe("ssrf_scheme_blocked");
    expect(
      await codeOf(
        run(
          "https://example.com/",
          scripted(redirect(302, "ftp://example.com/")),
        ),
      ),
    ).toBe("ssrf_scheme_blocked");
  });
  it("refuses a redirect to a host outside the project allowlist", async () => {
    const send = scripted(redirect(302, "https://other.com/"));
    expect(
      await codeOf(
        run(
          "https://example.com/",
          send,
          {},
          { projectAllow: ["example.com"] },
        ),
      ),
    ).toBe("ssrf_host_not_allowed");
  });
  it("lets an admin-allowed private host be reached, and redirected to", async () => {
    const send = scripted(redirect(302, "http://nas.lan/x"), ok());
    expect(
      (await run("https://example.com/", send, {}, { adminAllow: ["nas.lan"] }))
        .url.href,
    ).toBe("http://nas.lan/x");
  });
  it("refuses an invalid redirect target", async () => {
    expect(
      await codeOf(
        run("https://example.com/", scripted(redirect(302, "http://[bad"))),
      ),
    ).toBe("ssrf_bad_redirect");
  });
  it("follows 5 redirects and refuses the 6th", async () => {
    const five = scripted(
      ...Array.from({ length: 5 }, (_, i) => redirect(302, `/${i + 1}`)),
      ok(),
    );
    expect((await run("https://example.com/0", five)).url.pathname).toBe("/5");
    expect(five).toHaveBeenCalledTimes(6);
    const six = scripted(
      ...Array.from({ length: 6 }, (_, i) => redirect(302, `/${i + 1}`)),
      ok(),
    );
    expect(await codeOf(run("https://example.com/0", six))).toBe(
      "ssrf_too_many_redirects",
    );
    expect(six).toHaveBeenCalledTimes(6);
  });
  it("checks redirects against the live policy at every hop", async () => {
    const send = scripted(
      redirect(302, "https://other.com/a"),
      redirect(302, "http://10.0.0.1/"),
    );
    expect(await codeOf(run("https://example.com/", send))).toBe(
      "ssrf_address_blocked",
    );
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("resolves again for every hop, and pins each answer separately", async () => {
    const calls: string[] = [];
    const spy: Resolver = async (host) => {
      calls.push(host);
      return resolve(host);
    };
    const send = scripted(redirect(302, "https://other.com/"), ok());
    await guardedFetch("https://example.com/", {}, {}, { resolve: spy, send });
    expect(calls).toEqual(["example.com", "other.com"]);
  });
  it("discards the body of a redirect response", async () => {
    const response = redirect(302, "https://example.com/next", "payload");
    const cancel = vi.spyOn(response.body as ReadableStream, "cancel");
    await run("https://example.com/", scripted(response, ok()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("turns a POST into a GET without body on 301, 302 and 303, but not a GET or a HEAD that was not 303", async () => {
    for (const status of [301, 302, 303]) {
      const send = scripted(redirect(status, "/next"), ok());
      await run("https://example.com/", send, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "a/b" },
        body: "{}",
      });
      expect(send).toHaveBeenLastCalledWith(
        expect.objectContaining({
          method: "GET",
          body: undefined,
          headers: { Accept: "a/b" },
        }),
      );
    }
    const head = scripted(redirect(302, "/next"), ok());
    await run("https://example.com/", head, { method: "HEAD" });
    expect(head).toHaveBeenLastCalledWith(
      expect.objectContaining({ method: "HEAD" }),
    );
    const headSeeOther = scripted(redirect(303, "/next"), ok());
    await run("https://example.com/", headSeeOther, { method: "HEAD" });
    expect(headSeeOther).toHaveBeenLastCalledWith(
      expect.objectContaining({ method: "HEAD" }),
    );
    const put = scripted(redirect(302, "/next"), ok());
    await run("https://example.com/", put, { method: "PUT", body: "x" });
    expect(put).toHaveBeenLastCalledWith(
      expect.objectContaining({ method: "PUT", body: "x" }),
    );
    const seeOther = scripted(redirect(303, "/next"), ok());
    await run("https://example.com/", seeOther, { method: "PUT", body: "x" });
    expect(seeOther).toHaveBeenLastCalledWith(
      expect.objectContaining({ method: "GET", body: undefined }),
    );
  });
  it("keeps method, body and headers on a same-origin 307 or 308", async () => {
    for (const status of [307, 308]) {
      const send = scripted(redirect(status, "/next"), ok());
      await run("https://example.com/", send, {
        method: "POST",
        headers: { "X-Api-Key": "secret", "Content-Type": "application/json" },
        body: "{}",
      });
      expect(send).toHaveBeenLastCalledWith(
        expect.objectContaining({
          method: "POST",
          body: "{}",
          headers: {
            "X-Api-Key": "secret",
            "Content-Type": "application/json",
          },
        }),
      );
    }
  });
  it("keeps headers on a redirect to the same host with another path or port-less scheme match", async () => {
    const send = scripted(redirect(302, "https://example.com:443/x"), ok());
    await run("https://example.com/", send, {
      headers: { Authorization: "Bearer t" },
    });
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ headers: { Authorization: "Bearer t" } }),
    );
  });
  it.each([
    "https://other.com/x",
    "http://example.com/x",
    "https://example.com:8443/x",
  ])(
    "drops secret headers when redirected to another origin (%s)",
    async (location) => {
      const send = scripted(redirect(307, location), ok());
      await run(
        "https://example.com/",
        send,
        {
          method: "POST",
          body: "{}",
          headers: {
            Authorization: "Bearer t",
            Cookie: "s=1",
            "X-Api-Key": "k",
            "Proxy-Authorization": "p",
            Accept: "application/json",
            "Accept-Language": "en",
            "User-Agent": "orrery",
            "Content-Type": "application/json",
          },
        },
        {},
      );
      expect(send).toHaveBeenLastCalledWith(
        expect.objectContaining({
          headers: {
            Accept: "application/json",
            "Accept-Language": "en",
            "User-Agent": "orrery",
            "Content-Type": "application/json",
          },
          body: "{}",
        }),
      );
    },
  );
  it("matches header names without regard to case when dropping them", async () => {
    const send = scripted(redirect(302, "https://other.com/"), ok());
    await run("https://example.com/", send, {
      headers: { ACCEPT: "x", authorization: "t", "X-API-KEY": "k" },
    });
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ headers: { ACCEPT: "x" } }),
    );
  });
});
