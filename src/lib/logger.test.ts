import { afterEach, describe, expect, it, vi } from "vitest";
import { log } from "./logger";

afterEach(() => vi.restoreAllMocks());

describe("log", () => {
  it("writes one JSON line to stdout", () => {
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    log("info", "hello", { n: 1, token: "abc" });
    const line = JSON.parse(String(out.mock.calls[0][0]));
    expect(line).toMatchObject({ level: "info", msg: "hello", n: 1, token: "[redacted]" });
    expect(new Date(line.time).toString()).not.toBe("Invalid Date");
    expect(String(out.mock.calls[0][0]).endsWith("\n")).toBe(true);
  });
  it("hides every sensitive key, however deep, and keeps the rest", () => {
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    log("info", "x", { clientSecret: "x", apiKey: "z", request: { headers: [{ Authorization: "y", Cookie: "c" }], repo: "a/b" } });
    expect(JSON.parse(String(out.mock.calls[0][0]))).toMatchObject({
      clientSecret: "[redacted]",
      apiKey: "[redacted]",
      request: { headers: [{ Authorization: "[redacted]", Cookie: "[redacted]" }], repo: "a/b" },
    });
  });
  it("sends errors to stderr and defaults to no extra fields", () => {
    const err = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    log("error", "boom");
    expect(JSON.parse(String(err.mock.calls[0][0]))).toMatchObject({ level: "error", msg: "boom" });
    expect(out).not.toHaveBeenCalled();
  });
});
