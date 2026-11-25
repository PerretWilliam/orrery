import { describe, expect, it } from "vitest";
import { accentStyle } from "./accent";

describe("accentStyle", () => {
  it("sets the accent and a readable text color", () => {
    expect(accentStyle("#7c3aed")).toEqual({ "--primary": "#7c3aed", "--primary-foreground": "#ffffff", "--ring": "#7c3aed" });
    expect(accentStyle("#FFEB3B")).toMatchObject({ "--primary-foreground": "#000000" });
    expect(accentStyle("#000000")).toMatchObject({ "--primary-foreground": "#ffffff" });
    expect(accentStyle("#ffffff")).toMatchObject({ "--primary-foreground": "#000000" });
    expect(accentStyle("#808080")).toMatchObject({ "--primary-foreground": "#000000" });
  });
  it("gives no style for anything but #rrggbb, so no CSS comes from a repository", () => {
    for (const bad of [undefined, null, "", "red", "#fff", "#12345g", "#7c3aed; background:url(x)", "url(x)", "#7c3aed00"]) expect(accentStyle(bad as never)).toBeUndefined();
  });
});
