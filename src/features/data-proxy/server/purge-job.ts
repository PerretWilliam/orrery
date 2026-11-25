import { log } from "@/lib/logger";

export const PURGE_INTERVAL_MS = 24 * 3600_000;

export type PurgeJobDeps = {
  purge: () => Promise<number>;
  /** Runs `task` after `ms`; returns what cancels it. */
  schedule: (task: () => void, ms: number) => () => void;
};

/** Purges once at startup and then every day. A failed run is logged and tried again the next day. */
export function startCachePurge({ purge, schedule }: PurgeJobDeps): () => void {
  let cancel = () => {};
  let stopped = false;
  async function tick(): Promise<void> {
    try {
      await purge();
    } catch (error) {
      log("warn", "source cache purge failed", {
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
    if (!stopped) cancel = schedule(() => void tick(), PURGE_INTERVAL_MS);
  }
  void tick();
  return () => {
    stopped = true;
    cancel();
  };
}
