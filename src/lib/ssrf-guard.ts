import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * SSRF guard for every request Orrery makes on behalf of a `.hub.yml` source (the URL is untrusted data).
 *
 * - Only `http` and `https`, no credentials in the URL.
 * - Loopback, private, link-local, CGNAT, documentation, multicast, reserved and transition (NAT64, 6to4, Teredo)
 *   ranges are refused, IPv4-mapped IPv6 included. URL parsing already turns decimal, octal and hex forms
 *   (`2130706433`, `0177.0.0.1`, `0x7f.1`) into dotted decimal before the check.
 * - Cloud metadata addresses and names are refused for everybody, admin included.
 * - Only the instance admin can open private hosts (`adminAllow`). A project list (`projectAllow`) can only
 *   restrict: when set, the destination must match it and still pass every other rule.
 * - The name is resolved once per hop, every answer is checked, and the first answer is pinned (`target.address`):
 *   the transport must connect to it, never resolve again (DNS rebinding). Redirects are revalidated, 5 at most.
 */

export type SsrfErrorCode =
  | "ssrf_invalid_url"
  | "ssrf_scheme_blocked"
  | "ssrf_credentials_blocked"
  | "ssrf_address_blocked"
  | "ssrf_host_not_allowed"
  | "ssrf_dns_failed"
  | "ssrf_too_many_redirects"
  | "ssrf_bad_redirect";

const MESSAGES: Record<SsrfErrorCode, string> = {
  ssrf_invalid_url: "The source URL is not a valid absolute URL",
  ssrf_scheme_blocked: "Only http and https source URLs are allowed",
  ssrf_credentials_blocked:
    "Source URLs cannot carry a user name or a password; use a secret header instead",
  ssrf_address_blocked:
    "The source points to a private, internal or reserved address; an instance admin can allow a private host",
  ssrf_host_not_allowed:
    "The source host is not in this project's host allowlist",
  ssrf_dns_failed: "The source host name could not be resolved",
  ssrf_too_many_redirects: "The source redirected more than 5 times",
  ssrf_bad_redirect: "The source sent an invalid redirect",
};

export class SsrfError extends Error {
  constructor(readonly code: SsrfErrorCode) {
    super(Reflect.get(MESSAGES, code));
    this.name = "SsrfError";
  }
}

export const MAX_REDIRECTS = 5;

const PRIVATE_V4: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];
const PRIVATE_V6: ReadonlyArray<readonly [string, number]> = [
  ["::", 96], // unspecified, loopback, IPv4-compatible
  ["64:ff9b::", 96], // NAT64
  ["100::", 64], // discard
  ["2001::", 32], // Teredo
  ["2001:db8::", 32],
  ["2002::", 16], // 6to4
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
];
const METADATA_ADDRESSES = [
  ["169.254.169.254", "ipv4"], // AWS, GCP, Azure, DigitalOcean, OpenStack
  ["169.254.170.2", "ipv4"], // AWS ECS task credentials
  ["100.100.100.200", "ipv4"], // Alibaba
  ["192.0.0.192", "ipv4"], // Oracle
  ["fd00:ec2::254", "ipv6"], // AWS IPv6
] as const;
const METADATA_HOSTS: ReadonlySet<string> = new Set([
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "instance-data.ec2.internal",
]);

const privateRanges = new BlockList();
for (const [address, prefix] of PRIVATE_V4)
  privateRanges.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of PRIVATE_V6)
  privateRanges.addSubnet(address, prefix, "ipv6");
const metadataAddresses = new BlockList();
for (const [address, type] of METADATA_ADDRESSES)
  metadataAddresses.addAddress(address, type);

const stripZone = (address: string) => address.replace(/%.*$/, "");

export type AddressClass = "public" | "private" | "metadata" | "invalid";

/** Anything that is not a plain IP address is `invalid`, which the guard treats as blocked. */
export function classifyAddress(address: string): AddressClass {
  const clean = stripZone(address);
  const family = isIP(clean);
  if (family === 0) return "invalid";
  const type = family === 4 ? "ipv4" : "ipv6";
  if (metadataAddresses.check(clean, type)) return "metadata";
  return privateRanges.check(clean, type) ? "private" : "public";
}

/** One entry of an allowlist: `nas.lan`, `*.example.com`, `10.0.0.5`, `10.0.0.0/8` or `fd00::/8`. */
export type AllowRule =
  | { kind: "host"; name: string }
  | { kind: "suffix"; suffix: string }
  | { kind: "net"; net: BlockList };

const isLabel = (label: string) =>
  label.length >= 1 &&
  label.length <= 63 &&
  /^[a-z0-9-]+$/.test(label) &&
  !label.startsWith("-") &&
  !label.endsWith("-");
const isHostname = (name: string) =>
  name.length <= 253 && name.split(".").every((label) => isLabel(label));

/** `null` when the entry is not valid; API and UI use it to refuse bad entries, the guard skips them (narrower). */
export function parseAllowEntry(entry: string): AllowRule | null {
  const value = entry.trim().toLowerCase();
  if (value.startsWith("*."))
    return isHostname(value.slice(2))
      ? { kind: "suffix", suffix: value.slice(2) }
      : null;
  const [ip = "", prefixText, ...rest] = value.split("/");
  const family = isIP(ip);
  if (family === 0)
    return rest.length === 0 && prefixText === undefined && isHostname(value)
      ? { kind: "host", name: value }
      : null;
  const type = family === 4 ? "ipv4" : "ipv6";
  const net = new BlockList();
  if (prefixText === undefined) net.addAddress(ip, type);
  else {
    const prefix = Number(prefixText);
    if (
      rest.length > 0 ||
      !/^\d{1,3}$/.test(prefixText) ||
      prefix > (family === 4 ? 32 : 128)
    )
      return null;
    net.addSubnet(ip, prefix, type);
  }
  return { kind: "net", net };
}

function matches(rule: AllowRule, host: string, address: string): boolean {
  if (rule.kind === "host") return host === rule.name;
  if (rule.kind === "suffix") return host.endsWith(`.${rule.suffix}`);
  const clean = stripZone(address);
  return rule.net.check(clean, isIP(clean) === 4 ? "ipv4" : "ipv6");
}

export type SsrfPolicy = {
  /** Instance-wide private hosts or ranges (admin only). */
  readonly adminAllow?: readonly string[];
  /** Project hosts. Never opens anything; when present (even empty after cleaning), the host must match. */
  readonly projectAllow?: readonly string[];
};
export type CompiledPolicy = {
  readonly admin: readonly AllowRule[];
  readonly project: readonly AllowRule[] | null;
};

export function compilePolicy(policy: SsrfPolicy = {}): CompiledPolicy {
  const compile = (entries: readonly string[]) =>
    entries
      .map(parseAllowEntry)
      .filter((rule): rule is AllowRule => rule !== null);
  return {
    admin: compile(policy.adminAllow ?? []),
    project:
      policy.projectAllow && policy.projectAllow.length > 0
        ? compile(policy.projectAllow)
        : null,
  };
}

export type Resolver = (host: string) => Promise<readonly string[]>;
export const systemResolve: Resolver = async (host) =>
  (await lookup(host, { all: true, verbatim: true })).map(
    (entry) => entry.address,
  );

export type Target = {
  readonly url: URL;
  readonly host: string;
  readonly address: string;
  readonly family: 4 | 6;
};

/** Validates a URL and returns the address to connect to. Throws `SsrfError`. */
export async function resolveTarget(
  raw: string | URL,
  policy: CompiledPolicy,
  resolve: Resolver,
): Promise<Target> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfError("ssrf_invalid_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new SsrfError("ssrf_scheme_blocked");
  if (url.username !== "" || url.password !== "")
    throw new SsrfError("ssrf_credentials_blocked");
  const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (METADATA_HOSTS.has(host)) throw new SsrfError("ssrf_address_blocked");
  let addresses: readonly string[];
  if (isIP(host) !== 0) addresses = [host];
  else {
    try {
      addresses = await resolve(host);
    } catch {
      throw new SsrfError("ssrf_dns_failed");
    }
    if (addresses.length === 0) throw new SsrfError("ssrf_dns_failed");
  }
  for (const address of addresses) {
    const kind = classifyAddress(address);
    if (
      kind !== "public" &&
      !(
        kind === "private" &&
        policy.admin.some((rule) => matches(rule, host, address))
      )
    )
      throw new SsrfError("ssrf_address_blocked");
    if (
      policy.project &&
      !policy.project.some((rule) => matches(rule, host, address))
    )
      throw new SsrfError("ssrf_host_not_allowed");
  }
  const address = addresses[0] as string;
  return { url, host, address, family: isIP(stripZone(address)) === 4 ? 4 : 6 };
}

/** `lookup` option for `http.request` / `tls.connect` / undici: always the validated address, never a new DNS query. */
export const pinnedLookup =
  (address: string, family: 4 | 6) =>
  (
    _host: string,
    options: { all?: boolean },
    callback: (...args: unknown[]) => void,
  ) =>
    options.all
      ? callback(null, [{ address, family }])
      : callback(null, address, family);

export type SsrfRequest = {
  readonly url: URL;
  readonly address: string;
  readonly family: 4 | 6;
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal?: AbortSignal;
};
export type FetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
};
/** Performs one request to `request.address`, without following redirects and without a new DNS lookup. */
export type Send = (request: SsrfRequest) => Promise<Response>;

const REDIRECTS: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);
// Anything else may carry a secret bound to the first host (secret host binding), so it never follows a cross-origin redirect.
const CROSS_ORIGIN_HEADERS: ReadonlySet<string> = new Set([
  "accept",
  "accept-language",
  "user-agent",
  "content-type",
]);

/** Follows up to 5 redirects, revalidating every hop. Returns the final response and URL. */
export async function guardedFetch(
  raw: string | URL,
  init: FetchInit,
  policy: SsrfPolicy,
  deps: { resolve: Resolver; send: Send },
): Promise<{ response: Response; url: URL }> {
  const compiled = compilePolicy(policy);
  let current = raw;
  let { method = "GET", headers = {}, body } = init;
  for (let hop = 0; ; hop++) {
    const target = await resolveTarget(current, compiled, deps.resolve);
    const response = await deps.send({
      url: target.url,
      address: target.address,
      family: target.family,
      method,
      headers,
      body,
      signal: init.signal,
    });
    const location = REDIRECTS.has(response.status)
      ? response.headers.get("location")
      : null;
    if (location === null) return { response, url: target.url };
    await response.body?.cancel();
    if (hop === MAX_REDIRECTS) throw new SsrfError("ssrf_too_many_redirects");
    let next: URL;
    try {
      next = new URL(location, target.url);
    } catch {
      throw new SsrfError("ssrf_bad_redirect");
    }
    const toGet =
      (response.status === 303 && method !== "HEAD") ||
      ((response.status === 301 || response.status === 302) &&
        method === "POST");
    if (toGet) {
      method = "GET";
      body = undefined;
    }
    const crossOrigin = next.origin !== target.url.origin;
    headers = Object.fromEntries(
      Object.entries(headers).filter(([name]) => {
        const key = name.toLowerCase();
        return (
          !(toGet && key === "content-type") &&
          (!crossOrigin || CROSS_ORIGIN_HEADERS.has(key))
        );
      }),
    );
    current = next;
  }
}
