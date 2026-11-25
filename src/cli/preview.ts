import type { CliResult, Reader } from "./validate";

/** `orrery preview`: fetches one source or widget of a local `.hub.yml` through an instance, without caching it. Name provisional. */

export type Preview = {
  read: Reader;
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
};

const USAGE = `Usage: orrery preview --project <owner/repo> (--source <id> | --widget <page>:<index>) [--json] <file>
Fetches a GET source: a preview never sends anything else.
Environment: ORRERY_URL (the instance, https unless localhost) and ORRERY_TOKEN (an agent token of a maintainer of the project).
`;
const done = (
  code: CliResult["code"],
  stdout = "",
  stderr = "",
): CliResult => ({ code, stdout, stderr });
const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);
const REPO = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;

type Issue = {
  code?: string;
  path?: string;
  message?: string;
  fix?: string;
  line?: number;
};

/** The options and the one file, or `null` when the command line is not as documented. */
function parseArgs(args: readonly string[]) {
  const flags = new Map<string, string>();
  const files: string[] = [];
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") json = true;
    else if (arg === "--project" || arg === "--source" || arg === "--widget") {
      const value = args[++i];
      if (value === undefined || flags.has(arg)) return null;
      flags.set(arg, value);
    } else if (arg.startsWith("-")) return null;
    else files.push(arg);
  }
  const project = flags.get("--project");
  const source = flags.get("--source");
  const widget = /^([a-z][a-z0-9-]{0,63}):(\d{1,4})$/.exec(
    flags.get("--widget") ?? "",
  );
  if (
    files.length !== 1 ||
    !project ||
    !REPO.test(project) ||
    (source === undefined) === (widget === null) ||
    (flags.has("--widget") && !widget)
  )
    return null;
  return {
    file: files[0],
    project,
    json,
    target:
      source === undefined
        ? { page: widget![1], index: Number(widget![2]) }
        : { source },
  };
}

export async function runPreview(
  argv: readonly string[],
  { read, fetch, env }: Preview,
): Promise<CliResult> {
  if (argv.includes("--help") || argv.includes("-h")) return done(0, USAGE);
  const args = parseArgs(argv);
  if (!args) return done(2, "", USAGE);

  const base = URL.canParse(env.ORRERY_URL ?? "")
    ? new URL(env.ORRERY_URL as string)
    : null;
  if (!base || !env.ORRERY_TOKEN)
    return done(2, "", `Set ORRERY_URL and ORRERY_TOKEN.\n${USAGE}`);
  // The token is a bearer secret: it never travels in clear over the network.
  if (
    base.protocol !== "https:" &&
    !(base.protocol === "http:" && LOCAL.has(base.hostname))
  )
    return done(
      2,
      "",
      "ORRERY_URL must be https (http is only accepted for localhost).\n",
    );

  let yaml: string;
  try {
    yaml = read(args.file);
  } catch (error) {
    return done(
      2,
      "",
      `Cannot read ${args.file}: ${(error as NodeJS.ErrnoException).code ?? "unknown error"}\n`,
    );
  }

  let status: number;
  let body: { data?: unknown; fetchedAt?: string | null; errors?: Issue[] };
  try {
    const response = await fetch(
      new URL(`/api/v1/projects/${args.project}/preview`, base),
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.ORRERY_TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ yaml, ...args.target }),
        redirect: "error",
      },
    );
    status = response.status;
    body = await response.json();
  } catch {
    return done(
      2,
      "",
      "The instance did not answer with JSON. Check ORRERY_URL.\n",
    );
  }

  if (status === 200 && !body.errors) {
    return done(
      0,
      args.json
        ? `${JSON.stringify(body, null, 2)}\n`
        : `fetched ${body.fetchedAt ?? "now"}\n${JSON.stringify(body.data, null, 2)}\n`,
    );
  }
  const issues = body.errors ?? [
    { code: `http_${status}`, message: "Unexpected answer from the instance." },
  ];
  if (args.json)
    return done(1, `${JSON.stringify({ errors: issues }, null, 2)}\n`);
  return done(
    1,
    "",
    issues
      .map(
        (e) =>
          `${e.line === undefined ? "" : `${args.file}:${e.line} `}${e.path || "(root)"} [${e.code}] ${e.message}\n  fix: ${e.fix ?? "see the docs"}\n`,
      )
      .join(""),
  );
}
