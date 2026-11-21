import { describe, expect, it } from "vitest";
import { toHubUser } from "./profile";

describe("toHubUser", () => {
  it("maps a GitHub profile, with the no-reply e-mail whatever GitHub returned", () => {
    expect(toHubUser({ id: 42, login: "Octo-Cat", name: "The Octo", avatar_url: "https://a.example/42" })).toEqual({
      name: "The Octo",
      email: "42+octo-cat@users.noreply.github.com",
      emailVerified: false,
      image: "https://a.example/42",
      githubId: 42,
      login: "Octo-Cat",
    });
  });
  it.each([[null], [undefined], [""]])("falls back to the login when the name is %j", (name) => {
    expect(toHubUser({ id: 1, login: "octo", name }).name).toBe("octo");
  });
  it("has no image when GitHub gives none", () => {
    expect(toHubUser({ id: 1, login: "octo", avatar_url: null }).image).toBeUndefined();
    expect(toHubUser({ id: 1, login: "octo" }).image).toBeUndefined();
  });
});
