import { getTokens } from "@/features/agents/server/runtime";
import { getProjects } from "@/features/repos/server/runtime";
import { getWidgetData } from "@/features/widgets/server/runtime";
import { globalSingleton } from "@/lib/singleton";
import { createRateLimiter } from "../domain/rate-limit";
import { createApi } from "./handlers";

export const getApi = () =>
  globalSingleton("rest-api", () =>
    createApi({ authenticate: (token) => getTokens().authenticate(token), projects: getProjects(), widgetData: getWidgetData(), limiter: createRateLimiter() }),
  );
