import { getAudit } from "@/features/audit/server/runtime";
import { keyringFromEnv } from "@/lib/crypto";
import { getDb } from "@/lib/db/instance";
import { globalSingleton } from "@/lib/singleton";
import { createAdminStore } from "./drizzle-store";
import { createAdminSettings } from "./service";

export const getAdminSettings = () =>
  globalSingleton("admin-settings", () => createAdminSettings({ store: createAdminStore(getDb()), keyring: () => keyringFromEnv(), audit: (event) => getAudit().record(event) }));
