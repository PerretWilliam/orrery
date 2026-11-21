/**
 * Error catalog of the config. Each code is stable: once released it is never renamed, reused or removed
 * (a test pins the list). Every error carries a code, a JSON path, a message and a suggested fix, and the
 * same object is returned by the UI, the CLI, the API and the MCP server.
 * Messages describe the problem; they never contain values read from the file.
 */
export const CONFIG_ERRORS = {
  config_too_large: { fix: "Shrink the file below 256 KB, for example by moving long text into a source." },
  config_syntax: { fix: "Fix the YAML syntax at the reported line. Use spaces for indentation and plain text for keys." },
  config_duplicate_key: { fix: "Keep a single entry per key and remove or rename the duplicate." },
  config_multiple_documents: { fix: "Keep one YAML document: remove the `---` separators and everything after the first document." },
  config_alias_limit: { fix: "Use fewer YAML aliases, or write the repeated values out." },
  config_too_deep: { fix: "Flatten the structure to at most 32 levels of nesting." },
  config_forbidden_key: { fix: "Rename the key __proto__ to something else." },
  config_not_a_mapping: { fix: "Start the file with a mapping: `version: 1`, then `project`, `sources` and `pages`." },
  config_required: { fix: "Add the missing field. See the JSON Schema for its type and an example." },
  config_unsupported_version: { fix: "Set `version: 1`, the only supported version." },
  config_unknown_field: { fix: "Remove the field or fix its spelling. Unknown fields are rejected." },
  config_invalid_value: { fix: "Change the value to one that matches the JSON Schema for this field." },
  config_unknown_source: { fix: "Declare the source under `sources`, or point the widget at an existing source id." },
  config_duplicate_page_id: { fix: "Give each page a unique `id`." },
  config_duplicate_file: { fix: "Delete .repo-hub.yml, or merge it into .hub.yml: when both exist, .hub.yml is the one used." },
  config_limit_exceeded: { fix: "Remove sources or widgets until the config is within the documented limits." },
} as const;

export type ConfigIssueCode = keyof typeof CONFIG_ERRORS;

export type ConfigIssue = { code: ConfigIssueCode; path: string; message: string; fix: string; line?: number };

export const configIssue = (code: ConfigIssueCode, path: string, message: string, line?: number): ConfigIssue => ({
  code,
  path,
  message,
  fix: Reflect.get(CONFIG_ERRORS, code).fix,
  ...(line === undefined ? {} : { line }),
});
