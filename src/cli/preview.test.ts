import { describe, expect, it, vi } from "vitest";
import { runPreview } from "./preview";

const ENV = { ORRERY_URL: "https://hub.test", ORRERY_TOKEN: "orr_secret" };
function setup(
  answer: { status?: number; body?: unknown } | Error = {
    body: {
      data: { n: 1 },
      fetchedAt: "2026-01-01T00:00:00.000Z",
      stale: false,
    },
  },
  env: Record<string, string | undefined> = ENV,
) {
  const fetch = vi.fn(async () => {
    if (answer instanceof Error) throw answer;
    return {
      status: answer.status ?? 200,
      json: async () => answer.body,
    } as Response;
  });
  const read = vi.fn((path: string) => {
    if (path === "missing.yml")
      throw Object.assign(new Error("x"), { code: "ENOENT" });
    return "version: 1\n";
  });
  const run = (...argv: string[]) =>
    runPreview(argv, { read, fetch: fetch as never, env });
  return { run, fetch, read };
}
const BASE = ["--project", "o/r", "--source", "s", "f.yml"];

describe("orrery preview", () => {
  it("sends the file and the source to the instance with the token, and prints the answer", async () => {
    const { run, fetch } = setup();
    const result = await run(...BASE);
    expect(result).toEqual({
      code: 0,
      stdout: 'fetched 2026-01-01T00:00:00.000Z\n{\n  "n": 1\n}\n',
      stderr: "",
    });
    expect(fetch).toHaveBeenCalledWith(
      new URL("https://hub.test/api/v1/projects/o/r/preview"),
      {
        method: "POST",
        headers: {
          authorization: "Bearer orr_secret",
          "content-type": "application/json",
        },
        body: JSON.stringify({ yaml: "version: 1\n", source: "s" }),
        redirect: "error",
      },
    );
  });
  it("can name a widget instead, and print JSON", async () => {
    const { run, fetch } = setup({ body: { data: null, fetchedAt: null } });
    const result = await run(
      "--project",
      "o/r",
      "--widget",
      "main:2",
      "--json",
      "f.yml",
    );
    expect(JSON.parse(result.stdout)).toEqual({ data: null, fetchedAt: null });
    expect(
      JSON.parse(
        (fetch.mock.calls[0] as unknown as [unknown, { body: string }])[1].body,
      ),
    ).toEqual({ yaml: "version: 1\n", page: "main", index: 2 });
    expect(
      (await setup({ body: { data: null, fetchedAt: null } }).run(...BASE))
        .stdout,
    ).toContain("fetched now");
  });
  it("prints the source's errors with their fix, never the token", async () => {
    const errors = [
      {
        code: "ssrf_host_not_allowed",
        path: "",
        message: "Host not allowed",
        fix: "Allow the host.",
      },
      {
        code: "config_syntax",
        path: "pages",
        message: "bad",
        fix: "Fix it.",
        line: 3,
      },
    ];
    const result = await setup({ status: 400, body: { errors } }).run(...BASE);
    expect(result.code).toBe(1);
    expect(result.stderr).toBe(
      "(root) [ssrf_host_not_allowed] Host not allowed\n  fix: Allow the host.\nf.yml:3 pages [config_syntax] bad\n  fix: Fix it.\n",
    );
    expect(result.stderr).not.toContain("orr_secret");
    expect(
      JSON.parse(
        (await setup({ status: 403, body: { errors } }).run(...BASE, "--json"))
          .stdout,
      ).errors,
    ).toEqual(errors);
  });
  it("reports an unexpected answer", async () => {
    expect(
      (await setup({ status: 502, body: {} }).run(...BASE)).stderr,
    ).toContain("[http_502]");
    expect(
      (
        await setup({
          status: 400,
          body: { errors: [{ code: "c", message: "m" }] },
        }).run(...BASE)
      ).stderr,
    ).toContain("fix: see the docs");
    expect(await setup(new Error("net")).run(...BASE)).toMatchObject({
      code: 2,
      stderr: expect.stringContaining("did not answer"),
    });
  });
  it.each([
    [[]],
    [["--project", "o/r", "f.yml"]],
    [["--project", "o/r", "--source", "s", "--widget", "p:1", "f.yml"]],
    [["--project", "o/r", "--widget", "p-1", "f.yml"]],
    [["--project", "o/r", "--widget", "P:1", "f.yml"]],
    [["--project", "o", "--source", "s", "f.yml"]],
    [["--project", "o/r/x", "--source", "s", "f.yml"]],
    [["--project", "o/r", "--project", "o/r", "--source", "s", "f.yml"]],
    [["--project", "o/r", "--source"]],
    [["--project", "o/r", "--source", "s", "a.yml", "b.yml"]],
    [["--project", "o/r", "--source", "s", "--other", "f.yml"]],
  ])("prints the usage for %j", async (argv) => {
    const { run, fetch } = setup();
    expect(await run(...argv)).toMatchObject({
      code: 2,
      stderr: expect.stringContaining("Usage: orrery preview"),
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("prints the usage for --help", async () =>
    expect((await setup().run("-h")).code).toBe(0));
  it("needs the instance and the token", async () => {
    for (const env of [
      {},
      { ORRERY_URL: "https://hub.test" },
      { ORRERY_TOKEN: "t" },
      { ORRERY_URL: "nope", ORRERY_TOKEN: "t" },
    ]) {
      expect((await setup(undefined, env).run(...BASE)).stderr).toContain(
        "Set ORRERY_URL and ORRERY_TOKEN",
      );
    }
  });
  it("never sends the token in clear over the network", async () => {
    const { run, fetch } = setup(undefined, {
      ORRERY_URL: "http://hub.test",
      ORRERY_TOKEN: "t",
    });
    expect((await run(...BASE)).stderr).toContain("must be https");
    expect(
      (
        await setup(undefined, {
          ORRERY_URL: "ftp://localhost",
          ORRERY_TOKEN: "t",
        }).run(...BASE)
      ).code,
    ).toBe(2);
    expect(fetch).not.toHaveBeenCalled();
    for (const host of ["localhost:3000", "127.0.0.1", "[::1]:3000"]) {
      expect(
        (
          await setup(undefined, {
            ORRERY_URL: `http://${host}`,
            ORRERY_TOKEN: "t",
          }).run(...BASE)
        ).code,
      ).toBe(0);
    }
  });
  it("reports an unreadable file", async () => {
    const result = await setup().run(
      "--project",
      "o/r",
      "--source",
      "s",
      "missing.yml",
    );
    expect(result).toMatchObject({
      code: 2,
      stderr: "Cannot read missing.yml: ENOENT\n",
    });
    const { run, read } = setup();
    read.mockImplementation(() => {
      throw new Error("odd");
    });
    expect((await run(...BASE)).stderr).toContain("unknown error");
  });
});
