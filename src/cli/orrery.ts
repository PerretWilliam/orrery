import { closeSync, openSync, readSync } from "node:fs";
import { LIMITS } from "@/features/config/domain/limits";
import { runCli } from "./validate";

/** Process wiring of the CLI, bundled to dist/cli/orrery.cjs. Logic lives in validate.ts. */

// Reads at most one byte more than the limit, so an oversized file is reported without loading it whole.
function read(path: string): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- the file to validate is the CLI argument by design
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(LIMITS.maxBytes + 1);
    return buffer.toString("utf8", 0, readSync(fd, buffer, 0, buffer.length, 0));
  } finally {
    closeSync(fd);
  }
}

const { code, stdout, stderr } = runCli(process.argv.slice(2), read);
process.stdout.write(stdout);
process.stderr.write(stderr);
process.exitCode = code;
