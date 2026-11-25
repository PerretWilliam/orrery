// Weight of each widget: bundles every file of src/features/widgets/components/widgets/ on its own (the shell,
// React and Next are shared and left out), then checks its gzip size and that no banned library came in.
// Budgets in KB (gzip): 50 per widget, 120 for charts (recharts 3.11 weighs up to 114).
import { build } from "esbuild";
import { readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";

const DIR = "src/features/widgets/components/widgets";
const CHARTS = new Set(["line", "bar", "donut"]);
const BANNED = /node_modules\/(moment|lodash)\//;
const SHARED = ["react", "react-dom", "react/*", "next", "next/*", "next-intl", "@base-ui/*", "@/components/*", "@/lib/*", "@/features/*"];

let failed = false;
for (const file of readdirSync(DIR).filter((name) => /\.tsx?$/.test(name) && !name.includes(".test."))) {
  const name = file.replace(/\.tsx?$/, "");
  const result = await build({
    entryPoints: [`${DIR}/${file}`], bundle: true, minify: true, write: false, metafile: true, format: "esm", platform: "browser",
    jsx: "automatic", external: SHARED, logLevel: "error", define: { "process.env.NODE_ENV": '"production"' },
  });
  const kb = gzipSync(result.outputFiles[0].contents).length / 1024;
  const budget = CHARTS.has(name) ? 120 : 50;
  const banned = Object.keys(result.metafile.inputs).filter((path) => BANNED.test(path));
  const ok = kb <= budget && banned.length === 0;
  failed ||= !ok;
  console.log(`${ok ? "ok  " : "FAIL"} ${name.padEnd(24)} ${kb.toFixed(1).padStart(6)} KB / ${budget} KB${banned.length ? `  banned: ${banned[0]}` : ""}`);
}
process.exit(failed ? 1 : 0);
