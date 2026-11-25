// @vitest-environment node
import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { encrypt, parseKeyring } from "@/lib/crypto";
import { createSecretLookup } from "./lookup";
import { secretContext } from "./service";

const keyring = parseKeyring(`k1:${randomBytes(32).toString("base64")}`);

describe("secret lookup", () => {
  it("decrypts the secrets of the project and answers by name, with the bound hosts", async () => {
    const reader = { encrypted: vi.fn(async () => [{ name: "A_KEY", ciphertext: encrypt("v1", keyring, secretContext("r1", "A_KEY")), boundHosts: ["a.com"] }]) };
    const lookup = await createSecretLookup({ reader, keyring: () => keyring })("r1");
    expect(reader.encrypted).toHaveBeenCalledWith("r1");
    expect(lookup("A_KEY")).toEqual({ value: "v1", boundHosts: ["a.com"] });
    expect(lookup("OTHER")).toBeUndefined();
  });
  it("leaves out a secret it cannot decrypt, logging its name and never its value", async () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const swapped = encrypt("topsecret", keyring, secretContext("r1", "OTHER_KEY"));
    const reader = { encrypted: async () => [{ name: "A_KEY", ciphertext: swapped, boundHosts: ["a.com"] }] };
    const lookup = await createSecretLookup({ reader, keyring: () => keyring })("r1");
    expect(lookup("A_KEY")).toBeUndefined();
    const logged = write.mock.calls.map((call) => String(call[0])).join("");
    expect(logged).toContain("A_KEY");
    expect(logged).not.toContain("topsecret");
    write.mockRestore();
  });
});
