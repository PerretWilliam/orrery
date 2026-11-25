import { connection } from "next/server";
import { getApi } from "@/features/api/server/runtime";

export const GET = async (request: Request) => {
  await connection(); // per-request answer: never prerendered at build time
  return getApi().listProjects(request);
};
