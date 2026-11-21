import { describe, expect, it } from "vitest";
import { encrypt, parseKeyring } from "@/lib/crypto";
import { loadAuthSecret } from "./auth-secret";
import type { AuthStore } from "./store";

const keyring = parseKeyring(`k1:${Buffer.alloc(32, 7).toString("base64")}`);
const CONTEXT = "instance_settings.auth_secret";

function memory(initial: string | null = null, { open = true } = {}) {
  let stored = initial;
  const store = {
    authSecret: async () => stored,
    setAuthSecretIfAbsent: async (ciphertext: string) => {
      if (stored !== null || !open) return false;
      stored = ciphertext;
      return true;
    },
  } as unknown as AuthStore;
  return { store, read: () => stored, set: (value: string) => (stored = value) };
}

describe("loadAuthSecret", () => {
  it("generates a random secret on first use and stores it encrypted", async () => {
    const db = memory();
    const secret = await loadAuthSecret(db.store, keyring);
    expect(secret.length).toBeGreaterThanOrEqual(43);
    expect(db.read()).toMatch(/^v1\.k1\./);
    expect(db.read()).not.toContain(secret);
  });
  it("gives a different secret to different instances", async () => {
    expect(await loadAuthSecret(memory().store, keyring)).not.toBe(await loadAuthSecret(memory().store, keyring));
  });
  it("reads the stored secret afterwards", async () => {
    const db = memory();
    const first = await loadAuthSecret(db.store, keyring);
    expect(await loadAuthSecret(db.store, keyring)).toBe(first);
  });
  it("is bound to its place: the same ciphertext elsewhere does not decrypt", async () => {
    const db = memory(encrypt("planted", keyring, "instance_settings.client_secret"));
    await expect(loadAuthSecret(db.store, keyring)).rejects.toMatchObject({ code: "crypto_tampered" });
  });
  it("uses the secret another process stored first", async () => {
    const winner = encrypt("winner-secret", keyring, CONTEXT);
    let reads = 0;
    const store = {
      authSecret: async () => (reads++ === 0 ? null : winner),
      setAuthSecretIfAbsent: async () => false,
    } as unknown as AuthStore;
    expect(await loadAuthSecret(store, keyring)).toBe("winner-secret");
  });
  it("fails when nothing can be stored, as before the end of setup", async () => {
    await expect(loadAuthSecret(memory(null, { open: false }).store, keyring)).rejects.toThrow("setup is not finished");
  });
});
