// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The supply chain gates (docs/scope.md, threat table). These tests hold the configuration in place; that the scanners
 * really refuse a leaked key and a vulnerable dependency is proved in CI by scripts/security-gates-canary.sh.
 */

const read = (path: string) => readFileSync(path, "utf8");
const workflows = readdirSync(".github/workflows").map((name) => [name, read(`.github/workflows/${name}`)] as const);
const job = (name: string) => new RegExp(`\\n  ${name}:\\n([\\s\\S]*?)(?=\\n  [a-z-]+:\\n|$)`).exec(read(".github/workflows/ci.yml"))?.[1] ?? "";

describe("threat: Supply chain", () => {
  it.each(workflows)("%s pins every action to a commit and limits its token", (_, text) => {
    const uses = [...text.matchAll(/^\s*(?:- )?uses:\s*(\S+)/gm)].map((match) => match[1]);
    for (const action of uses) expect(action).toMatch(/^\.\/|@[0-9a-f]{40}$/);
    expect(text).toMatch(/^permissions:/m);
    expect(text).not.toMatch(/pull_request_target|write-all/);
  });

  it("runs every scanner on each pull request, at a fixed version, and proves they can fail", () => {
    expect(read(".github/workflows/ci.yml")).toMatch(/^on:\n  pull_request:/m);
    const security = job("security");
    for (const gate of [
      "npm run audit:deps",
      "semgrep scan --error",
      "gitleaks:v8.30.1",
      "osv-scanner:v2.7.1",
      "npm run test:security",
      "sh scripts/security-gates-canary.sh",
    ]) {
      expect(security).toContain(gate);
    }
    expect(security).toContain("fetch-depth: 0"); // gitleaks reads the whole history
    expect(security).not.toMatch(/continue-on-error|\|\| true|:latest/);
    // The canary must use the same scanners as the gates it vouches for.
    const images = (text: string) => [...text.matchAll(/ghcr\.io\/\S+:v[\d.]+/g)].map((m) => m[0]).sort();
    expect(images(read("scripts/security-gates-canary.sh"))).toEqual(images(security));
  });

  it("installs from the lockfile only, every package from the registry with its checksum", () => {
    const { packages } = JSON.parse(read("package-lock.json")) as { packages: Record<string, { resolved?: string; integrity?: string; link?: boolean; inBundle?: boolean }> };
    const unpinned = Object.entries(packages).filter(
      ([path, entry]) => path !== "" && !entry.link && !entry.inBundle && !(entry.resolved?.startsWith("https://registry.npmjs.org/") && entry.integrity),
    );
    expect(unpinned.map(([path]) => path)).toEqual([]);
    for (const [, text] of [...workflows, ["Dockerfile", read("Dockerfile")] as const]) expect(text).not.toMatch(/npm (install|i)\b/);
  });

  it("gives every ignored advisory a reason and an end date", () => {
    const entries = read("osv-scanner.toml").split("[[IgnoredVulns]]").slice(1);
    for (const entry of entries) {
      expect(entry).toMatch(/^reason = ".{20,}"/m);
      expect(entry).toMatch(/^(ignoreUntil|effectiveUntil) = \d{4}-\d{2}-\d{2}/m);
    }
  });
});

describe("the security suite", () => {
  it("has a block for every threat of the scope's table", () => {
    const table = read("docs/scope.md").split("| Threat | Control | Test proves |")[1].split("\n\n")[0];
    const threats = [...table.matchAll(/^\| (?!---)([^|]+?) \|/gm)].map((match) => match[1]);
    const suite = readdirSync("tests/security").map((name) => read(`tests/security/${name}`)).join("\n");
    expect(threats.length).toBeGreaterThanOrEqual(12);
    expect(threats.filter((threat) => !suite.includes(`describe("threat: ${threat}"`))).toEqual([]);
  });
});
