export type Level = "debug" | "info" | "warn" | "error";

// Never log secret values: any field whose key looks sensitive is replaced, however deep it sits.
const SENSITIVE = /secret|token|password|authorization|cookie|api[-_]?key|private[-_]?key/i;
const hide = (key: string, value: unknown) => (SENSITIVE.test(key) ? "[redacted]" : value);

/** One JSON object per line on stdout (stderr for errors), ready for any log collector. */
export function log(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields }, hide);
  (level === "error" ? process.stderr : process.stdout).write(`${line}\n`);
}
