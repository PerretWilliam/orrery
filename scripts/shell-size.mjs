// Weight of the app shell: for each route, the JS the browser must load first (the shared root chunks plus the
// route's entry chunks, gzip). Lazy chunks (widgets) are left out: scripts/widget-budgets.mjs caps those one by one.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const LIMIT_KB = 220;
const NEXT = ".next";
const gz = (file) => gzipSync(readFileSync(join(NEXT, file))).length;
const root = JSON.parse(readFileSync(join(NEXT, "build-manifest.json"), "utf8")).rootMainFiles;

const manifests = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? manifests(path) : entry.name.endsWith("client-reference-manifest.js") ? [path] : [];
  });

let worst = { kb: 0, route: "" };
for (const path of manifests(join(NEXT, "server/app"))) {
  const entries = JSON.parse(/"entryJSFiles":(\{.*?\}),"/s.exec(readFileSync(path, "utf8"))?.[1] ?? "{}");
  const files = new Set([...root, ...Object.values(entries).flat()]);
  const kb = [...files].reduce((sum, file) => sum + gz(file), 0) / 1024;
  if (kb > worst.kb) worst = { kb, route: path.replace(/^.*server\/app/, "").replace(/\/?(page|route)_client-reference-manifest\.js$/, "") || "/" };
}
const ok = worst.kb <= LIMIT_KB;
console.log(`${ok ? "ok  " : "FAIL"} shell (${worst.route})  ${worst.kb.toFixed(1)} KB / ${LIMIT_KB} KB gzip`);
process.exit(ok ? 0 : 1);
