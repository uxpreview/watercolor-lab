/**
 * Builds public/opengraph.png (1200×630) from the landscape figure: the
 * painting full-bleed, the experiment's name set in the site's voice on a
 * cream plate. Run after `npm run figures`.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { launchChromium } from "./browser.mjs";

const figure = resolve(import.meta.dirname, "../docs/figures/landscape.png");
const out = resolve(import.meta.dirname, "../public/opengraph.png");
const png = await readFile(figure);
const dataUri = `data:image/png;base64,${png.toString("base64")}`;

const html = `<!doctype html><html><head><style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; overflow: hidden; position: relative; background: #fef6e9; }
  img { width: 1200px; height: 630px; object-fit: cover; object-position: center 40%; display: block; }
  .plate {
    position: absolute; left: 48px; bottom: 48px;
    background: rgba(254, 246, 233, 0.94);
    padding: 26px 36px;
    border-radius: 14px;
    font-family: system-ui, sans-serif;
  }
  .kicker { font-size: 20px; font-weight: 600; letter-spacing: 0.14em; color: #5f6e73; text-transform: uppercase; }
  .title { font-size: 54px; font-weight: 800; letter-spacing: -0.02em; color: #003f48; margin-top: 6px; }
  .sub { font-size: 24px; color: #2f3d3e; margin-top: 8px; }
</style></head><body>
  <img src="${dataUri}">
  <div class="plate">
    <div class="kicker">EXP-041 · ryankm.com</div>
    <div class="title">Watercolor Lab</div>
    <div class="sub">A real watercolor simulator — fluid dynamics, real pigments, your browser</div>
  </div>
</body></html>`;

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.waitForLoadState("networkidle");
await page.screenshot({ path: out });
await browser.close();
console.log(out);
