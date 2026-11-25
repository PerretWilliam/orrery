import { getAccessPolicy } from "@/features/access/server/runtime";
import { keyringFromEnv } from "@/lib/crypto";
import { getDb } from "@/lib/db/instance";
import { globalSingleton } from "@/lib/singleton";
import { createSecretsStore } from "./drizzle-store";
import { createSecrets } from "./service";

export const getSecrets = () =>
  globalSingleton("secrets", () =>
    createSecrets({
      store: createSecretsStore(getDb()),
      keyring: () => keyringFromEnv(),
      canManage: (repo, login) => getAccessPolicy().can(repo, login, "manage_secrets"),
      now: () => new Date(),
    }),
  );
