import { parseConfig } from "@/features/config/domain/parse-config";

/** `orrery validate`: checks a `.hub.yml` offline with the same parser and errors as the server. Name provisional. */

export type Reader = (path: string) => string;
export type CliResult = { code: 0 | 1 | 2; stdout: string; stderr: string };

const USAGE = "Usage: orrery validate [--json] <file>\n";
const done = (code: CliResult["code"], stdout = "", stderr = ""): CliResult => ({ code, stdout, stderr });

export function runCli(argv: readonly string[], read: Reader): CliResult {
  const [command, ...args] = argv;
  if (command === "--help" || command === "-h") return done(0, USAGE);
  if (command !== "validate") return done(2, "", USAGE);

  const json = args.includes("--json");
  const rest = args.filter((arg) => arg !== "--json");
  if (rest.includes("--help") || rest.includes("-h")) return done(0, USAGE);
  if (rest.length !== 1 || rest[0].startsWith("-")) return done(2, "", USAGE);
  const [file] = rest;

  let text: string;
  try {
    text = read(file);
  } catch (error) {
    return done(2, "", `Cannot read ${file}: ${(error as NodeJS.ErrnoException).code ?? "unknown error"}\n`);
  }

  const result = parseConfig(text);
  if (json) return done(result.ok ? 0 : 1, `${JSON.stringify({ valid: result.ok, issues: result.ok ? [] : result.issues }, null, 2)}\n`);
  if (result.ok) return done(0, `${file} is valid\n`);
  const lines = result.issues.map(
    (issue) => `${file}${issue.line === undefined ? "" : `:${issue.line}`} ${issue.path || "(root)"} [${issue.code}] ${issue.message}\n  fix: ${issue.fix}\n`,
  );
  return done(1, "", lines.join(""));
}
