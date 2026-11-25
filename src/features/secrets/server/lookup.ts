import { decrypt, type Keyring } from "@/lib/crypto";
import { log } from "@/lib/logger";
import type { SecretLookup } from "../domain/resolve";
import { secretContext } from "./service";
import type { SecretsReader } from "./store";

/**
 * The secrets of one project, decrypted, for the data proxy to fill `${NAME}` references just before a request.
 * A value that cannot be decrypted (unknown key, tampering) is left out, so the reference fails closed as unknown;
 * only the name is logged.
 */
export const createSecretLookup =
  ({ reader, keyring }: { reader: SecretsReader; keyring: () => Keyring }) =>
  async (repositoryId: string): Promise<SecretLookup> => {
    const found = new Map<string, { value: string; boundHosts: readonly string[] }>();
    for (const row of await reader.encrypted(repositoryId)) {
      try {
        found.set(row.name, { value: decrypt(row.ciphertext, keyring(), secretContext(repositoryId, row.name)), boundHosts: row.boundHosts });
      } catch {
        log("warn", "a secret could not be decrypted", { repositoryId, name: row.name });
      }
    }
    return (name) => found.get(name);
  };
