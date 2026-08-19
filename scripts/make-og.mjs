/**
 * Builds public/opengraph.png (1200×630) in the Lab's share-card shape — the
 * same layout as the other experiments' cards: record line, the name in
 * display type with the vermillion dot, a two-line claim, the site, and the
 * experiment's own picture in a hairline frame on the right. Here the picture
 * is the landscape figure the simulator painted. Run after `npm run figures`.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { launchChromium } from "./browser.mjs";

const root = resolve(import.meta.dirname, "..");
const figure = resolve(root, "docs/figures/landscape.png");
const out = resolve(root, "public/opengraph.png");
const png = await readFile(figure);
const font = await readFile(resolve(root, "public/fonts/figtree-normal.woff2"));
const dataUri = `data:image/png;base64,${png.toString("base64")}`;
const fontUri = `data:font/woff2;base64,${font.toString("base64")}`;

const html = `<!doctype html><html><head><style>
  @font-face { font-family: "Figtree"; src: url("${fontUri}") format("woff2"); font-weight: 300 900; }
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; overflow: hidden; position: relative;
    background: #fef6e9; color: #182528;
    font-family: "Figtree", ui-sans-serif, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .copy { position: absolute; left: 90px; top: 0; bottom: 0; width: 520px; }
  .kicker {
    position: absolute; top: 158px;
    font-size: 19px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: #5f6e73;
  }
  .title {
    position: absolute; top: 230px;
    font-size: 66px; font-weight: 800; letter-spacing: -0.03em; line-height: 1; white-space: nowrap;
  }
  .dot { color: #e73d00; }
  .sub {
    position: absolute; top: 336px;
    font-size: 27px; line-height: 1.5; color: #2f3d3e; max-width: 520px;
  }
  .site {
    position: absolute; top: 522px;
    font-size: 19px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: #5f6e73;
  }
  .frame {
    position: absolute; left: 622px; top: 118px; width: 440px; height: 394px;
    border: 1px solid #e5dac6; padding: 14px; background: #f8eedd;
  }
  .frame img { width: 100%; height: 100%; object-fit: cover; object-position: center 40%; display: block; }
</style></head><body>
  <div class="copy">
    <div class="kicker">EXP-040 · Tool · The Lab</div>
    <div class="title">Watercolor Lab<span class="dot">.</span></div>
    <div class="sub">A real watercolor simulator.<br>Real pigments, real fluid, your browser.</div>
    <div class="site">ryankm.com</div>
  </div>
  <div class="frame"><img src="${dataUri}"></div>
</body></html>`;

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out });
await browser.close();
console.log(out);
