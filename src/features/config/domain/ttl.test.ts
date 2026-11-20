import { describe, expect, it } from "vitest";
import { parseTtl } from "./ttl";

describe("parseTtl", () => {
  it.each([
    ["10s", 10],
    ["60s", 60],
    ["5m", 300],
    ["1h", 3600],
    ["24h", 86400],
    ["1440m", 86400],
    ["86400s", 86400],
  ])("accepts %s", (value, seconds) => {
    expect(parseTtl(value)).toBe(seconds);
  });

  it.each(["9s", "86401s", "1441m", "25h", "0s", "05m", "5", "m", "5d", "1.5m", " 5m", "5m ", "-5m", "5M", "1000000s", "5mx", "5ms", "x5m", ""])(
    "rejects %j",
    (value) => {
      expect(parseTtl(value)).toBeNull();
    },
  );
});
