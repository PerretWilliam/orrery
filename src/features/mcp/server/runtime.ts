import { getApi } from "@/features/api/server/runtime";
import { globalSingleton } from "@/lib/singleton";
import { createMcp } from "./mcp";

export const getMcp = () => globalSingleton("mcp", () => createMcp(getApi()));
