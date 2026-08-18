/**
 * One place that knows how to launch Chromium for the headless harnesses.
 *
 * Inside the GPU-less build container Chromium lives at /opt/pw-browsers and
 * renders through SwiftShader. On a desktop the installed Chrome is used and
 * the real GPU does the work — orders of magnitude faster, and the renders
 * are what a visitor actually sees. Override with PW_CHROMIUM=/path/to/binary.
 */

import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const CONTAINER_CHROMIUM = "/opt/pw-browsers/chromium";

export function launchChromium(extraArgs = []) {
  const explicit = process.env.PW_CHROMIUM;
  const path = explicit && existsSync(explicit) ? explicit : existsSync(CONTAINER_CHROMIUM) ? CONTAINER_CHROMIUM : null;
  const software = process.env.SOFTWARE_GL === "1" || (path === CONTAINER_CHROMIUM && !explicit);
  const args = ["--hide-scrollbars", ...(software ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : []), ...extraArgs];
  return path ? chromium.launch({ executablePath: path, args }) : chromium.launch({ channel: "chrome", args });
}
