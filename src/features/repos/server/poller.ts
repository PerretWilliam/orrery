import { log } from "@/lib/logger";
import { pollIntervalMs } from "../domain/discovery";

export const RETRY_MS = 60_000;

export type PollerDeps = {
  syncAll: () => Promise<unknown>;
  settings: () => Promise<{ setup: boolean; pollIntervalSeconds: number }>;
  /** `ORRERY_PUBLIC_URL` is set: GitHub pushes changes to the webhook, so the hub looks everywhere once and then waits for it. */
  webhooks: boolean;
  /** Runs `task` after `ms`; returns what cancels it. */
  schedule: (task: () => void, ms: number) => () => void;
};

/**
 * Keeps discovery going. Until the first-run wizard has finished there is nothing to look at, so it asks again every
 * minute. Without webhooks it looks at everything every `pollIntervalSeconds` (one minute at least). A failed run is
 * logged and retried: GitHub being down must never stop the loop.
 */
export function startPolling({ syncAll, settings, webhooks, schedule }: PollerDeps): () => void {
  let cancel = () => {};
  let stopped = false;
  const later = (ms: number) => {
    if (!stopped) cancel = schedule(() => void tick(), ms);
  };

  async function tick(): Promise<void> {
    let next = RETRY_MS;
    try {
      const { setup, pollIntervalSeconds } = await settings();
      if (setup) {
        // A failure below keeps this delay: polling keeps its rhythm, a webhook-only instance has no other trigger and tries again soon.
        next = webhooks ? RETRY_MS : pollIntervalMs(pollIntervalSeconds);
        await syncAll();
        // With webhooks the first full look is the last one this loop makes.
        if (webhooks) return;
      }
    } catch (error) {
      log("warn", "repository discovery run failed", { error: error instanceof Error ? error.message : "unknown error" });
    }
    later(next);
  }

  void tick();
  return () => {
    stopped = true;
    cancel();
  };
}
