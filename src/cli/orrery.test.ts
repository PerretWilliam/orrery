/* eslint-disable security/detect-non-literal-fs-filename -- test files live in a fresh temporary directory */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "orrery-cli-"));
const run = (...args: string[]) => spawnSync("node", ["dist/cli/orrery.cjs", ...args], { encoding: "utf8" });

beforeAll(() => {
  execFileSync("node", ["scripts/build-cli.mjs"]);
}, 30_000);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("bundled orrery CLI", () => {
  it("validates a file and sets the exit code", () => {
    const good = join(dir, "good.yml");
    const bad = join(dir, "bad.yml");
    const huge = join(dir, "huge.yml");
    writeFileSync(good, "version: 1\nproject: { name: X }\npages: [{ id: p, title: P, widgets: [] }]\n");
    writeFileSync(bad, "version: 1\nextra: 1\n");
    writeFileSync(huge, "#".repeat(10 * 1024 * 1024));

    expect(run("validate", good)).toMatchObject({ status: 0, stdout: `${good} is valid\n` });
    const invalid = run("validate", bad);
    expect(invalid.status).toBe(1);
    expect(invalid.stderr).toContain(`${bad}:2 extra [config_unknown_field]`);
    expect(run("validate", huge).stderr).toContain("[config_too_large]");
    expect(run("validate", join(dir, "missing.yml"))).toMatchObject({ status: 2, stderr: expect.stringContaining("ENOENT") });
    expect(run().status).toBe(2);
  });
});
