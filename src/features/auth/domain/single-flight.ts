/**
 * One call at a time per key; concurrent callers share its result. GitHub refresh tokens are single use, so two parallel
 * refreshes of the same account would make one of them fail and look like a revoked login. V1 runs one replica.
 */
export function singleFlight<T>() {
  const running = new Map<string, Promise<T>>();
  return (key: string, run: () => Promise<T>): Promise<T> => {
    const existing = running.get(key);
    if (existing) return existing;
    const started = run().finally(() => running.delete(key));
    running.set(key, started);
    return started;
  };
}
