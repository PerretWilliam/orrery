import { getAccessPolicy } from "@/features/access/server/runtime";
import { getSourceProxy } from "@/features/data-proxy/server/runtime";
import { getTokens } from "@/features/agents/server/runtime";
import { getProjects } from "@/features/repos/server/runtime";
import { getWidgetData } from "@/features/widgets/server/runtime";
import { globalSingleton } from "@/lib/singleton";
import { createRateLimiter } from "../domain/rate-limit";
import { createApi } from "./handlers";

export const getApi = () =>
  globalSingleton("rest-api", () =>
    createApi({
      authenticate: (token) => getTokens().authenticate(token),
      projects: getProjects(),
      widgetData: getWidgetData(),
      limiter: createRateLimiter(),
      canManage: (repo, login) =>
        getAccessPolicy().can(repo, login, "manage_hosts"),
      proxy: getSourceProxy(),
    }),
  );
