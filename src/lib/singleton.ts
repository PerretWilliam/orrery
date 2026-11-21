/**
 * One instance per process, shared by every bundle. Route handlers and `instrumentation.ts` can be bundled apart, so a
 * module-level variable would give each of them its own copy of a cache or a queue.
 */
export function globalSingleton<T>(name: string, create: () => T): T {
  const key = Symbol.for(`orrery.${name}`);
  const existing: T | undefined = Reflect.get(globalThis, key);
  if (existing !== undefined) return existing;
  const made = create();
  Reflect.set(globalThis, key, made);
  return made;
}
