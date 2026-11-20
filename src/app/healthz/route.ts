// Liveness: the process is up. Deliberately touches nothing else.
export function GET() {
  return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
}
