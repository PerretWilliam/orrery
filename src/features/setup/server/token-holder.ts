import { resolveSetupToken, type ResolvedToken } from "../domain/token";

const KEY = Symbol.for("orrery.setupToken");

/**
 * The setup token of this process. Kept on `globalThis` so the instrumentation hook (which prints it) and the
 * request handlers share one value even when the bundler gives each its own copy of this module.
 */
export function getSetupToken(env: Record<string, string | undefined> = process.env): ResolvedToken {
  const existing = Reflect.get(globalThis, KEY) as ResolvedToken | undefined;
  if (existing) return existing;
  const resolved = resolveSetupToken(env);
  Reflect.set(globalThis, KEY, resolved);
  return resolved;
}
