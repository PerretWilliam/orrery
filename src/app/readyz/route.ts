import { checkReadiness } from "@/features/ops/server/check-readiness";
import { getDb } from "@/lib/db/instance";

// Readiness: database reachable and migrations applied. 503 otherwise, so Docker keeps traffic away.
export async function GET() {
  const result = await checkReadiness(getDb);
  return Response.json(
    result.ready ? { status: "ok" } : { status: "unavailable", reason: result.reason },
    { status: result.ready ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
