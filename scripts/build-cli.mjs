import { build } from "esbuild";

await build({
  entryPoints: ["src/cli/orrery.ts"],
  outfile: "dist/cli/orrery.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  banner: { js: "#!/usr/bin/env node" },
  alias: { "@": "./src" },
  logLevel: "warning",
});
