import { isCollection, parseDocument, visit, type YAMLError } from "yaml";
import type { z } from "zod";
import { configIssue, type ConfigIssue, type ConfigIssueCode } from "./errors";
import { LIMITS } from "./limits";
import { ConfigV1 } from "./schema-v1";

/**
 * Turns the text of a `.hub.yml` into a validated config, or a list of issues. Never throws on bad input.
 * The file is untrusted: size, alias, depth and key limits are enforced before the schema runs.
 */

export type ParseConfigResult = { ok: true; config: ConfigV1 } | { ok: false; issues: ConfigIssue[] };

const MAX_ISSUES = 20;

type Path = (string | number)[];

/** `pages[0].widgets[1].source`; the root is the empty string. */
export const formatPath = (path: readonly PropertyKey[]): string =>
  path.reduce<string>((out, key) => (typeof key === "number" ? `${out}[${key}]` : out ? `${out}.${String(key)}` : String(key)), "");

const failure = (code: ConfigIssueCode, message: string, path = ""): ParseConfigResult => ({
  ok: false,
  issues: [configIssue(code, path, message)],
});

const isMapping = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const yamlIssue = (error: YAMLError, text: string): ConfigIssue =>
  configIssue(
    error.code === "DUPLICATE_KEY" ? "config_duplicate_key" : error.code === "MULTIPLE_DOCS" ? "config_multiple_documents" : "config_syntax",
    "",
    error.message.split("\n")[0],
    text.slice(0, error.pos[0]).split("\n").length,
  );

/** Iterative walk (no recursion to overflow): nesting depth and `__proto__` keys. */
function scan(root: unknown): ConfigIssue | null {
  const stack: { value: unknown; path: Path }[] = [{ value: root, path: [] }];
  for (let item = stack.pop(); item; item = stack.pop()) {
    const { value, path } = item;
    if (typeof value !== "object" || value === null) continue;
    if (path.length >= LIMITS.maxDepth) {
      return configIssue("config_too_deep", formatPath(path), `Nesting is deeper than ${LIMITS.maxDepth} levels`);
    }
    for (const key of Object.keys(value)) {
      if (key === "__proto__") {
        return configIssue("config_forbidden_key", formatPath(path), "The key __proto__ is not allowed");
      }
      stack.push({ value: Reflect.get(value, key), path: [...path, Array.isArray(value) ? Number(key) : key] });
    }
  }
  return null;
}

function schemaIssues(error: z.ZodError): ConfigIssue[] {
  return error.issues.flatMap((issue): ConfigIssue[] => {
    if (issue.code === "unrecognized_keys") {
      return issue.keys.map((key) => configIssue("config_unknown_field", formatPath([...issue.path, key]), `Unknown field "${key}"`));
    }
    const custom = issue.code === "custom" ? (issue.params?.code as ConfigIssueCode | undefined) : undefined;
    const code = custom ?? (issue.input === undefined ? "config_required" : "config_invalid_value");
    return [configIssue(code, formatPath(issue.path), issue.message)];
  });
}

export function parseConfig(text: string): ParseConfigResult {
  if (Buffer.byteLength(text) > LIMITS.maxBytes) {
    return failure("config_too_large", `The file is larger than ${LIMITS.maxBytes / 1024} KB`);
  }

  const doc = parseDocument(text);
  const problems = [...doc.errors, ...doc.warnings];
  if (problems.length > 0) return { ok: false, issues: problems.slice(0, MAX_ISSUES).map((problem) => yamlIssue(problem, text)) };

  let complexKey = false;
  visit(doc, {
    Pair(_, pair) {
      complexKey = isCollection(pair.key);
      return complexKey ? visit.BREAK : undefined;
    },
  });
  if (complexKey) return failure("config_syntax", "Keys must be plain text, not lists or mappings");

  let data: unknown;
  try {
    // Stryker disable next-line ObjectLiteral: the limit equals the library default; kept explicit as the documented contract
    data = doc.toJS({ maxAliasCount: LIMITS.maxAliasExpansions });
  } catch {
    return failure("config_alias_limit", `Aliases expand beyond the limit of ${LIMITS.maxAliasExpansions}`);
  }

  if (!isMapping(data)) return failure("config_not_a_mapping", "The file must contain a mapping at its top level");
  const unsafe = scan(data);
  if (unsafe) return { ok: false, issues: [unsafe] };

  if (!Object.hasOwn(data, "version")) return failure("config_required", "The version field is required", "version");
  if (data.version !== 1) return failure("config_unsupported_version", "Only version 1 is supported", "version");

  const result = ConfigV1.safeParse(data, { reportInput: true });
  if (!result.success) return { ok: false, issues: schemaIssues(result.error).slice(0, MAX_ISSUES) };
  return { ok: true, config: result.data };
}
