import { getAccessPolicy } from "@/features/access/server/runtime";
import { getAudit } from "@/features/audit/server/runtime";
import { createAuthStore } from "@/features/auth/server/drizzle-store";
import { getDb } from "@/lib/db/instance";
import { globalSingleton } from "@/lib/singleton";
import { createTokensStore } from "./drizzle-store";
import { createTokens } from "./service";

export const getTokens = () =>
  globalSingleton("agent-tokens", () =>
    createTokens({
      store: createTokensStore(getDb()),
      // The same rule as signing in: an instance admin, or let in by the access policy.
      canUse: async (login) => (await createAuthStore(getDb()).isAdmin(login.toLowerCase())) || (await getAccessPolicy().canSignIn(login)),
      now: () => new Date(),
      audit: (event) => getAudit().record(event),
    }),
  );
