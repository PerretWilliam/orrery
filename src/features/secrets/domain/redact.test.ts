import { describe, expect, it } from "vitest";
import { MIN_REDACTED_LENGTH, redactSecrets } from "./redact";

const VALUE = "s3cr3t/value+1";

describe("redactSecrets", () => {
  it("cuts the value from strings and keys at any depth, as sent or percent-encoded", () => {
    const echoed = {
      headers: { authorization: `Bearer ${VALUE}`, other: `${VALUE} ${VALUE}` },
      url: `https://api.example.com/x?k=${encodeURIComponent(VALUE)}`,
      args: [{ [VALUE]: 1 }],
    };
    expect(redactSecrets(echoed, [VALUE])).toEqual({
      headers: { authorization: "Bearer [redacted]", other: "[redacted] [redacted]" },
      url: "https://api.example.com/x?k=[redacted]",
      args: [{ "[redacted]": 1 }],
    });
  });
  it("finds a value that JSON escapes", () => {
    const quoted = 'pa"ss\\word';
    expect(redactSecrets({ a: `x ${quoted}` }, [quoted])).toEqual({ a: "x [redacted]" });
  });
  it("handles every value", () => {
    expect(redactSecrets(["first-secret", "second-secret"], ["first-secret", "second-secret"])).toEqual(["[redacted]", "[redacted]"]);
  });
  it("hands the very same data back when there is nothing long enough to look for", () => {
    const data = { a: "short12" };
    expect(MIN_REDACTED_LENGTH).toBe(8);
    expect(redactSecrets(data, ["short12"])).toBe(data);
    expect(redactSecrets(data, [])).toBe(data);
    expect(redactSecrets({ a: "short123" }, ["short123"])).toEqual({ a: "[redacted]" });
  });
  it("drops the answer rather than show it when cutting would break it", () => {
    expect(() => redactSecrets({ id: 123456789 }, ["123456789"])).toThrow();
  });
});
