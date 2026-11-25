import { getSourceProxy } from "@/features/data-proxy/server/runtime";
import { globalSingleton } from "@/lib/singleton";
import { createWidgetData } from "./widget-data";

export const getWidgetData = () => globalSingleton("widget-data", () => createWidgetData({ proxy: getSourceProxy() }));
