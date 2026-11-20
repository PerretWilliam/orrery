export type Level = "debug" | "info" | "warn" | "error";

// Never log secret values: any field whose key looks sensitive is replaced.
const SENSITIVE = /secret|token|password|authorization|cookie|api[-_]?key|private[-_]?key/i;

export function redact(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, SENSITIVE.test(k) ? "[redacted]" : v]));
}

/** One JSON object per line on stdout (stderr for errors), ready for any log collector. */
export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...redact(fields) });
  (level === "error" ? process.stderr : process.stdout).write(`${line}\n`);
}
