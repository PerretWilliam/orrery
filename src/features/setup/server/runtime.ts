import { keyringFromEnv } from "@/lib/crypto";
import { getDb } from "@/lib/db/instance";
import { createSetupStore } from "./drizzle-store";
import { createSetupService, type SetupService } from "./service";
import { getSetupToken } from "./token-holder";

/** The wizard's service with its real dependencies: database, setup token, encryption keys, GitHub over `fetch`. */
export const getSetupService = (): SetupService =>
  createSetupService({
    store: createSetupStore(getDb()),
    token: getSetupToken().token,
    keyring: () => keyringFromEnv(),
    fetch: (input, init) => fetch(input, init),
    now: () => new Date(),
  });
