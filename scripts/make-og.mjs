/**
 * Builds public/opengraph.png (1200×630) in the Lab's share-card shape — the
 * same layout as the other experiments' cards, in the site's current system:
 * a mono kicker, the name in the grotesk, a two-line claim in the reading
 * serif, the wordmark, and the experiment's own picture in a hairline frame
 * on the right. Here the picture is the landscape figure the simulator
 * painted. Run after `npm run figures`.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { launchChromium } from "./browser.mjs";

const root = resolve(import.meta.dirname, "..");
const figure = resolve(root, "docs/figures/landscape.png");
const out = resolve(root, "public/opengraph.png");
const png = await readFile(figure);
const dataUri = `data:image/png;base64,${png.toString("base64")}`;
const fontUri = async (name) =>
  `data:font/woff2;base64,${(await readFile(resolve(root, `public/fonts/${name}.woff2`))).toString("base64")}`;
const [grotesk, serif, mono] = await Promise.all(["hanken-grotesk", "source-serif-4", "jetbrains-mono"].map(fontUri));

const html = `<!doctype html><html><head><style>
  @font-face { font-family: "Hanken Grotesk"; src: url("${grotesk}") format("woff2"); font-weight: 100 900; }
  @font-face { font-family: "Source Serif 4"; src: url("${serif}") format("woff2"); font-weight: 200 900; }
  @font-face { font-family: "JetBrains Mono"; src: url("${mono}") format("woff2"); font-weight: 100 800; }
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; overflow: hidden; position: relative;
    background: #faf9f5; color: #141413;
    font-family: "Hanken Grotesk", ui-sans-serif, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .copy { position: absolute; left: 90px; top: 0; bottom: 0; width: 520px; }
  .kicker {
    position: absolute; top: 152px;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 20px; font-weight: 400; letter-spacing: 0.07em; text-transform: uppercase; color: #5e5d59;
  }
  .title {
    position: absolute; top: 222px; left: -3px;
    font-size: 70px; font-weight: 600; letter-spacing: -0.025em; line-height: 1.04; white-space: nowrap;
  }
  .sub {
    position: absolute; top: 328px;
    font-family: "Source Serif 4", ui-serif, Georgia, serif;
    font-size: 27px; line-height: 1.48; color: #3d3d3a; max-width: 520px;
  }
  .site {
    position: absolute; top: 519px;
    font-size: 21px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #141413;
  }
  .frame {
    position: absolute; left: 622px; top: 118px; width: 440px; height: 394px;
    border-radius: 16px; padding: 14px; background: #f0eee6;
  }
  .frame img { width: 100%; height: 100%; object-fit: cover; object-position: center 40%; display: block; border-radius: 3px; }
</style></head><body>
  <div class="copy">
    <div class="kicker">Tool · The Lab</div>
    <div class="title">Watercolor Lab</div>
    <div class="sub">A real watercolor simulator.<br>Real pigments, real fluid, your browser.</div>
    <div class="site">Ryan McCarty</div>
  </div>
  <div class="frame"><img src="${dataUri}"></div>
</body></html>`;

const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.evaluate(async () => {
  // Ask for each face by name: a font nothing has painted yet is not "ready".
  await Promise.all(
    ['600 20px "Hanken Grotesk"', '700 20px "Hanken Grotesk"', '400 20px "Source Serif 4"', '400 20px "JetBrains Mono"'].map((f) =>
      document.fonts.load(f)
    )
  );
  await document.fonts.ready;
});
await page.screenshot({ path: out });
await browser.close();
console.log(out);
