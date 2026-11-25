import { describe, expect, it } from "vitest";
import { healthOf } from "./status";

const status = (over = {}) => ({ type: "status", source: "s", path: "s", up: ["ok", 200, true], degraded: ["slow"], ...over }) as never;

describe("healthOf", () => {
  it("is up, degraded or down by the lists, comparing exactly", () => {
    expect(healthOf(status(), { s: "ok" })).toBe("up");
    expect(healthOf(status(), { s: 200 })).toBe("up");
    expect(healthOf(status(), { s: true })).toBe("up");
    expect(healthOf(status(), { s: "slow" })).toBe("degraded");
    expect(healthOf(status(), { s: "OK" })).toBe("down");
    expect(healthOf(status(), { s: "200" })).toBe("down");
    expect(healthOf(status(), { s: "boom" })).toBe("down");
  });
  it("is down for anything not listed when no degraded list is given", () => {
    expect(healthOf(status({ degraded: undefined }), { s: "slow" })).toBe("down");
  });
  it("is unknown when the source gave nothing", () => {
    expect(healthOf(status(), {})).toBeNull();
    expect(healthOf(status(), { s: null })).toBeNull();
    expect(healthOf(status(), null)).toBeNull();
  });
});
