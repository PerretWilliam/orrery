export async function register() {
  // The database client and node:crypto are not available in the edge runtime.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startInstance } = await import("@/features/setup/server/start");
  await startInstance();
}
