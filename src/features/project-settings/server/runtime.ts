import { getAccessPolicy } from "@/features/access/server/runtime";
import { getAudit } from "@/features/audit/server/runtime";
import { getDiscovery } from "@/features/repos/server/runtime";
import { getDb } from "@/lib/db/instance";
import { globalSingleton } from "@/lib/singleton";
import { createProjectSettingsStore } from "./drizzle-store";
import { createProjectSettings } from "./service";

export const getProjectSettings = () =>
  globalSingleton("project-settings", () =>
    createProjectSettings({
      store: createProjectSettingsStore(getDb()),
      can: (repo, login, capability) => getAccessPolicy().can(repo, login, capability),
      reindex: async (repo) => void (await getDiscovery().refresh(repo, { force: true })),
      audit: (event) => getAudit().record(event),
    }),
  );
