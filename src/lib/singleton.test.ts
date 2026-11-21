import { afterEach, describe, expect, it, vi } from "vitest";
import { globalSingleton } from "./singleton";

afterEach(() => Reflect.deleteProperty(globalThis, Symbol.for("orrery.test-thing")));

describe("globalSingleton", () => {
  it("creates once and hands the same object to everybody, even a second copy of the module", async () => {
    const create = vi.fn(() => ({ n: 1 }));
    const first = globalSingleton("test-thing", create);
    expect(globalSingleton("test-thing", create)).toBe(first);
    vi.resetModules();
    const again = await import("./singleton");
    expect(again.globalSingleton("test-thing", create)).toBe(first);
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("keeps names apart", () => {
    expect(globalSingleton("test-thing", () => "a")).toBe("a");
    expect(Reflect.get(globalThis, Symbol.for("orrery.other"))).toBeUndefined();
  });
});
