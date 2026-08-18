/**
 * Renders the scripted scenes in headless Chromium and saves a PNG per scene.
 *
 *   node scripts/shoot.mjs [outDir] [sceneName...]
 *
 * Serves the built dist/ (run `npm run build` first), drives window.__wash,
 * and screenshots the sheet canvas. Also used by make-figures.mjs. SwiftShader
 * does the GL, so this runs anywhere node and the vendored Chromium do.
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { RUN, SCENES } from "./scenes.mjs";

const DIST = resolve(import.meta.dirname, "../dist");
const outDir = process.argv[2] ?? resolve(import.meta.dirname, "../docs/figures");
const only = process.argv.slice(3);

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".map": "application/json",
};

const server = createServer(async (req, res) => {
  let path = (req.url ?? "/").split("?")[0];
  if (path === "/") path = "/index.html";
  try {
    const body = await readFile(join(DIST, path));
    res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const port = server.address().port;

mkdirSync(outDir, { recursive: true });

// Software GL: run the physics on a smaller grid. SIM=WxH overrides.
const simQuery = process.env.SIM ?? "528x352";
const wanted = only.length > 0 ? SCENES.filter((s) => only.includes(s.name)) : [...SCENES];
// SwiftShader saturates the cores, so navigation and evaluation get generous
// timeouts and the default worker count leaves headroom.
const WORKERS = Math.min(Number(process.env.WORKERS ?? 2), wanted.length || 1);

const launchBrowser = () =>
  chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
  });

const queue = [...wanted];
const shootScene = async (page, scene) => {
  await page.goto(`http://127.0.0.1:${port}/?sim=${simQuery}&seed=${scene.seed}`);
  await page.waitForFunction(() => Boolean(window.__wash));
  const t0 = Date.now();
  await page.evaluate(`(${RUN.toString()})(window.__wash, ${JSON.stringify({ program: scene.program })})`);
  // One real frame so the render pass runs after the last step.
  await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
  const shot = join(outDir, `${scene.name}.png`);
  await page.locator("canvas.sheet").screenshot({ path: shot });
  console.log(`  ${scene.name} done (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
};

await Promise.all(
  Array.from({ length: WORKERS }, async () => {
    const browser = await launchBrowser();
    const page = await browser.newPage({ viewport: { width: 1680, height: 1150 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(600000);
    page.setDefaultNavigationTimeout(600000);
    page.on("pageerror", (err) => console.error("page error:", err.message));
    for (let scene = queue.shift(); scene; scene = queue.shift()) {
      console.log(`scene: ${scene.name}`);
      try {
        await shootScene(page, scene);
      } catch (err) {
        console.error(`  ${scene.name} FAILED: ${err.message}`);
      }
    }
    // The whole page once, for layout checks.
    if (only.length === 0 || only.includes("page")) {
      if (!shootScene.pageDone) {
        shootScene.pageDone = true;
        await page.goto(`http://127.0.0.1:${port}/`);
        await page.waitForFunction(() => Boolean(window.__wash));
        await page.evaluate(() => new Promise((ok) => setTimeout(ok, 400)));
        await page.screenshot({ path: join(outDir, "page.png"), fullPage: true });
        console.log("  page.png done");
      }
    }
    await browser.close();
  })
);
server.close();
