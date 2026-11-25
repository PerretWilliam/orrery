import { describe, expect, it } from "vitest";
import { secretsPath } from "./paths";

describe("secretsPath", () => {
  it("encodes each segment and appends the query as given", () => {
    expect(secretsPath({ owner: "acme", name: "web" })).toBe("/settings/acme/web/secrets");
    expect(secretsPath({ owner: "a/b", name: "c d" }, "?x=1")).toBe("/settings/a%2Fb/c%20d/secrets?x=1");
  });
});
