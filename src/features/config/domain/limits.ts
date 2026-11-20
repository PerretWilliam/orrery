/** Hard limits of a `.hub.yml` (docs/scope.md, "Config file and widgets"). Shared by the schema and the parser. */
export const LIMITS = {
  maxBytes: 256 * 1024,
  maxDepth: 32,
  maxAliasExpansions: 100,
  maxSources: 50,
  maxWidgets: 100,
  ttlMinSeconds: 10,
  ttlMaxSeconds: 24 * 60 * 60,
  ttlDefault: "5m",
} as const;
