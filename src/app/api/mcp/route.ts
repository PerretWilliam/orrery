import { connection } from "next/server";
import { getMcp } from "@/features/mcp/server/runtime";

export const POST = async (request: Request) => {
  await connection(); // per-request answer: never prerendered at build time
  return getMcp().handle(request);
};

/** Stateless server: there is no stream to open. */
export const GET = () => new Response(null, { status: 405, headers: { allow: "POST" } });
