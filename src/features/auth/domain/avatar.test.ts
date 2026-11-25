import { describe, expect, it } from "vitest";
import { avatarUrl } from "./avatar";

describe("avatarUrl", () => {
  it("keeps a GitHub avatar", () => {
    expect(avatarUrl("https://avatars.githubusercontent.com/u/1?v=4")).toBe("https://avatars.githubusercontent.com/u/1?v=4");
  });
  it.each([
    null,
    undefined,
    "",
    "not a url",
    "http://avatars.githubusercontent.com/u/1",
    "https://evil.test/u/1",
    "https://avatars.githubusercontent.com.evil.test/u/1",
    "https://avatars.githubusercontent.com@evil.test/u/1",
    "https://avatars.githubusercontent.com:8443/u/1",
    "https://avatars.githubusercontent.com/u/../x",
    "javascript:alert(1)",
    "data:image/svg+xml,<svg/>",
  ])("drops %s", (image) => {
    expect(avatarUrl(image)).toBeNull();
  });
});
