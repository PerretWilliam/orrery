import { getSourceProxy } from "@/features/data-proxy/server/runtime";
import { getGitProvider } from "@/features/repos/server/runtime";
import { globalSingleton } from "@/lib/singleton";
import { createActivity } from "./activity";
import { createWidgetData } from "./widget-data";

export const getWidgetData = () =>
  globalSingleton("widget-data", () => createWidgetData({ proxy: getSourceProxy(), activity: createActivity({ git: getGitProvider() }) }));
