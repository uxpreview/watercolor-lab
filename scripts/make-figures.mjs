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

const result = spawnSync(process.execPath, [resolve(import.meta.dirname, "shoot.mjs"), outDir, ...scenes], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
