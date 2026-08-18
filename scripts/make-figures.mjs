/**
 * Regenerates the README figures by running the scripted scenes through the
 * real simulator in headless Chromium (see scripts/shoot.mjs). The pictures
 * in the README therefore cannot drift from what the app actually paints.
 *
 * Run `npm run build` first; then `npm run figures`.
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const outDir = resolve(import.meta.dirname, "../docs/figures");
const scenes = ["landscape", "wet-on-wet", "granulation", "glaze", "drybrush", "salt", "flat-wash", "backruns"];

// Figures render at the app's real simulation resolution. Under software GL
// (no GPU in the machine) this takes a couple of hours; on real hardware the
// same scenes run at interactive rates.
const result = spawnSync(process.execPath, [resolve(import.meta.dirname, "shoot.mjs"), outDir, ...scenes], {
  stdio: "inherit",
  env: { ...process.env, SIM: process.env.SIM ?? "1056x704" },
});
process.exit(result.status ?? 1);
