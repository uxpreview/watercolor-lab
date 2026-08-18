/**
 * Headless checks for the maths. No GPU here: what runs in the shaders is
 * pinned through its TS twins (km.ts is transcribed into GLSL line for line),
 * and everything CPU-side — pigment derivation, brush kinematics, paper
 * statistics — is exercised directly. `npm test` bundles this file with
 * esbuild and runs it under node, same harness as the other Lab experiments.
 */

import { composite, hexToLinear, kmFromMasstone, layerRT, linearToSrgbByte, masstone, PAPER_REFLECTANCE, type Vec3 } from "../paint/km";
import { handlingNote, PIGMENTS } from "../paint/pigments";
import { beginStroke, brushRadius, strokeTo, tapStamp, TOOLS } from "../paint/brush";
import { mixWell, wellName } from "../paint/mix";
import { generatePaper, PAPERS } from "../engine/paper";

let failures = 0;
let checks = 0;

function ok(condition: boolean, label: string): void {
  checks++;
  if (!condition) {
    failures++;
    console.error(`  ✗ ${label}`);
  }
}

function near(a: number, b: number, tol: number, label: string): void {
  ok(Math.abs(a - b) <= tol, `${label} (got ${a}, want ${b} ±${tol})`);
}

function section(name: string): void {
  console.log(name);
}

// --- Kubelka-Munk ----------------------------------------------------------

section("km: layer reflectance and transmittance");
{
  const r: Vec3 = [0, 0, 0];
  const t: Vec3 = [0, 0, 0];

  // No layer: transparent.
  layerRT([1, 1, 1], [1, 1, 1], 0, r, t);
  ok(r.every((v) => v === 0) && t.every((v) => v === 1), "zero thickness is a no-op layer");

  // Energy: R + T never exceeds 1 for an absorbing layer.
  for (const x of [0.05, 0.3, 1, 4]) {
    layerRT([0.8, 0.5, 0.2], [0.6, 0.6, 0.6], x, r, t);
    ok(
      r.every((v, i) => v >= 0 && v <= 1 && v + t[i] <= 1 + 1e-9),
      `R and T physical at thickness ${x}`
    );
  }

  // Thickness monotonicity: more paint reflects more of the layer's own
  // color and transmits less.
  let prevR = -1;
  let prevT = 2;
  for (const x of [0.1, 0.3, 0.9, 2.7, 8]) {
    layerRT([0.4, 0.4, 0.4], [0.5, 0.5, 0.5], x, r, t);
    ok(r[0] > prevR && t[0] < prevT, `monotone in thickness at ${x}`);
    prevR = r[0];
    prevT = t[0];
  }

  // Thick-layer limit equals the closed-form masstone.
  const k: Vec3 = [0.9, 0.3, 0.1];
  const s: Vec3 = [0.4, 0.4, 0.4];
  layerRT(k, s, 500, r, t);
  const inf = masstone(k, s);
  for (let c = 0; c < 3; c++) near(r[c], inf[c], 1e-6, `masstone limit channel ${c}`);

  // Pure absorber: Beer-Lambert.
  layerRT([1, 1, 1], [0, 0, 0], 2, r, t);
  near(t[0], Math.exp(-2), 1e-9, "non-scattering glaze follows Beer-Lambert");
  near(r[0], 0, 1e-9, "non-scattering glaze reflects nothing");
}

section("km: compositing");
{
  const r: Vec3 = [0, 0, 0];
  const t: Vec3 = [0, 0, 0];
  const out: Vec3 = [0, 0, 0];

  // Identity: an empty layer over any substrate is the substrate.
  layerRT([0.5, 0.5, 0.5], [0.5, 0.5, 0.5], 0, r, t);
  composite(r, t, [0.3, 0.6, 0.9], out);
  for (let c = 0; c < 3; c++) near(out[c], [0.3, 0.6, 0.9][c], 1e-9, `identity composite channel ${c}`);

  // A glaze darkens what is under it, never brightens it.
  layerRT([0.8, 0.1, 0.1], [0.05, 0.05, 0.05], 1, r, t);
  composite(r, t, PAPER_REFLECTANCE, out);
  ok(
    out.every((v, c) => v <= PAPER_REFLECTANCE[c] + 1e-9),
    "a transparent glaze can only remove light"
  );

  // Order matters, as it does on paper: ultramarine over burnt sienna is not
  // burnt sienna over ultramarine when opacities differ.
  const blue = kmFromMasstone(hexToLinear("#252d80"), 0.45);
  const brown = kmFromMasstone(hexToLinear("#8a3b20"), 0.5);
  const rB: Vec3 = [0, 0, 0];
  const tB: Vec3 = [0, 0, 0];
  const rN: Vec3 = [0, 0, 0];
  const tN: Vec3 = [0, 0, 0];
  layerRT(blue.k, blue.s, 0.8, rB, tB);
  layerRT(brown.k, brown.s, 0.8, rN, tN);
  const blueOverBrown: Vec3 = [0, 0, 0];
  const brownOverBlue: Vec3 = [0, 0, 0];
  const groundB: Vec3 = [0, 0, 0];
  const groundN: Vec3 = [0, 0, 0];
  composite(rN, tN, PAPER_REFLECTANCE, groundN);
  composite(rB, tB, groundN, blueOverBrown);
  composite(rB, tB, PAPER_REFLECTANCE, groundB);
  composite(rN, tN, groundB, brownOverBlue);
  const diff = Math.abs(blueOverBrown[0] - brownOverBlue[0]) + Math.abs(blueOverBrown[2] - brownOverBlue[2]);
  ok(diff > 0.002, "glazing order is visible in the result");

  // Mixing is linear in K and S: half-and-half of two pigments equals the
  // sum of half-concentrations. (This is what the suspension textures rely
  // on when two strokes meet in the water.)
  const mixK: Vec3 = [0, 0, 0];
  const mixS: Vec3 = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    mixK[c] = 0.5 * blue.k[c] + 0.5 * brown.k[c];
    mixS[c] = 0.5 * blue.s[c] + 0.5 * brown.s[c];
  }
  const rMix: Vec3 = [0, 0, 0];
  const tMix: Vec3 = [0, 0, 0];
  layerRT(mixK, mixS, 1, rMix, tMix);
  ok(rMix.every((v) => v >= 0 && v <= 1), "mixture stays physical");
}

section("km: sRGB round trip");
{
  const linear = hexToLinear("#8a3b20");
  ok(linear.every((v) => v >= 0 && v <= 1), "hex decodes into [0,1] linear");
  near(linearToSrgbByte(linear[0]), 0x8a, 1, "linear→sRGB inverts the decode (R)");
  near(linearToSrgbByte(linear[1]), 0x3b, 1, "linear→sRGB inverts the decode (G)");
  near(linearToSrgbByte(linear[2]), 0x20, 1, "linear→sRGB inverts the decode (B)");
}

// --- Pigments --------------------------------------------------------------

section("pigments: the library is physical and honest");
{
  ok(PIGMENTS.length >= 30, `a real paint box (${PIGMENTS.length} pigments)`);
  const r: Vec3 = [0, 0, 0];
  const t: Vec3 = [0, 0, 0];
  for (const p of PIGMENTS) {
    ok(p.k.every((v) => Number.isFinite(v) && v >= 0), `${p.id}: K finite and non-negative`);
    ok(p.s.every((v) => Number.isFinite(v) && v > 0), `${p.id}: S finite and positive`);

    // The derivation must round-trip: an infinitely thick layer of the
    // derived K,S has to reproduce the declared masstone (within the clamp
    // that keeps near-black and near-white channels physical).
    const target = hexToLinear(p.hex);
    const inf = masstone(p.k, p.s);
    for (let c = 0; c < 3; c++) {
      const clamped = Math.min(Math.max(target[c], 0.012), 0.985);
      near(inf[c], clamped, 1e-6, `${p.id}: masstone round-trip channel ${c}`);
    }

    // A thin wash of any pigment must read paler than its masstone over
    // this paper — that is what makes it watercolor.
    layerRT(p.k, p.s, 0.15, r, t);
    const wash: Vec3 = [0, 0, 0];
    composite(r, t, PAPER_REFLECTANCE, wash);
    const washLum = wash[0] + wash[1] + wash[2];
    const massLum = inf[0] + inf[1] + inf[2];
    ok(washLum > massLum - 1e-6, `${p.id}: a thin wash is paler than masstone`);

    ok(handlingNote(p).length > 0, `${p.id}: has a handling note`);
  }

  const ids = new Set(PIGMENTS.map((p) => p.id));
  ok(ids.size === PIGMENTS.length, "pigment ids are unique");
}

// --- Mixing well -----------------------------------------------------------

section("mix: the well is Kubelka-Munk linear");
{
  const ultra = PIGMENTS.find((p) => p.id === "french-ultramarine")!;
  const sienna = PIGMENTS.find((p) => p.id === "burnt-sienna")!;

  ok(mixWell([]) === null, "an empty well is clean water");
  ok(mixWell([{ pigment: ultra, parts: 1 }]) === ultra, "a single dip is the pigment itself");

  const half = mixWell([
    { pigment: ultra, parts: 1 },
    { pigment: sienna, parts: 1 },
  ])!;
  for (let c = 0; c < 3; c++) {
    near(half.k[c], 0.5 * ultra.k[c] + 0.5 * sienna.k[c], 1e-9, `mix K linear channel ${c}`);
    near(half.s[c], 0.5 * ultra.s[c] + 0.5 * sienna.s[c], 1e-9, `mix S linear channel ${c}`);
  }
  near(half.granulation, 0.5 * (ultra.granulation + sienna.granulation), 1e-9, "mix granulation averages");
  near(half.staining, 0.5 * (ultra.staining + sienna.staining), 1e-9, "mix staining averages");

  // Parts weight the mix: two dips of ultramarine to one of sienna leans blue.
  const twoToOne = mixWell([
    { pigment: ultra, parts: 2 },
    { pigment: sienna, parts: 1 },
  ])!;
  for (let c = 0; c < 3; c++) {
    near(twoToOne.k[c], (2 * ultra.k[c] + sienna.k[c]) / 3, 1e-9, `weighted mix channel ${c}`);
  }

  ok(/^#[0-9a-f]{6}$/.test(half.hex), "mix hex is displayable");
  ok(wellName([{ pigment: ultra, parts: 1 }, { pigment: sienna, parts: 1 }]).includes("+"), "well name joins components");

  // The lift tool exists and carries no pigment.
  ok(TOOLS.lift.pigment === 0 && TOOLS.lift.water > 0, "lift is a damp, clean scrub");
}

// --- Brush -----------------------------------------------------------------

section("brush: stroke kinematics");
{
  const state = beginStroke(TOOLS.round, 0.5, 0.5, 0.5, 0, 0);
  const stamps = strokeTo(state, 300, 0);
  ok(stamps.length > 4, `a 300px stroke lays down stamps (${stamps.length})`);

  // Spacing is uniform regardless of event chunking: one 300px move and
  // thirty 10px moves make the same number of stamps (±1 for the carry).
  const chunked = beginStroke(TOOLS.round, 0.5, 0.5, 0.5, 0, 0);
  let chunkedCount = 0;
  for (let i = 1; i <= 30; i++) chunkedCount += strokeTo(chunked, i * 10, 0).length;
  ok(Math.abs(chunkedCount - stamps.length) <= 1, `stamp count independent of event batching (${chunkedCount} vs ${stamps.length})`);

  // The reservoir drains: the last stamp of a long stroke carries less
  // pigment than the first.
  const long = beginStroke(TOOLS.round, 0.5, 0.5, 1, 0, 0);
  const first = strokeTo(long, 200, 0)[0];
  let last = first;
  for (let i = 1; i <= 20; i++) {
    const s = strokeTo(long, 200 + i * 200, 0);
    if (s.length > 0) last = s[s.length - 1];
  }
  ok(last.pigment < first.pigment, "a long stroke exhausts toward clean water");

  // Radii: the tools span rigger-to-mop and stay positive at slider zero.
  ok(brushRadius(TOOLS.rigger, 0) >= 1, "rigger never vanishes");
  ok(brushRadius(TOOLS.mop, 1) / brushRadius(TOOLS.rigger, 0.1) > 20, "the box spans rigger to mop");

  // Water tool carries no pigment; drybrush is dry.
  const waterState = beginStroke(TOOLS.water, 0.5, 0.5, 0.9, 0, 0);
  ok(tapStamp(waterState).pigment === 0, "the water brush is clean");
  ok(TOOLS.drybrush.dryness === 1, "drybrush gates on the paper's tooth");

  // Spatter is deterministic for a given seed.
  const a = beginStroke(TOOLS.spatter, 0.5, 0.5, 0.5, 0, 0, 99);
  const b = beginStroke(TOOLS.spatter, 0.5, 0.5, 0.5, 0, 0, 99);
  const sa = strokeTo(a, 400, 0);
  const sb = strokeTo(b, 400, 0);
  ok(
    sa.length === sb.length && sa.every((s, i) => s.x === sb[i].x && s.y === sb[i].y),
    "spatter replays exactly from its seed"
  );
}

// --- Paper -----------------------------------------------------------------

section("paper: the sheet is plausible");
{
  for (const spec of Object.values(PAPERS)) {
    const field = generatePaper(160, 120, spec, 11);
    let min = 1;
    let max = 0;
    let sum = 0;
    const n = field.width * field.height;
    for (let i = 0; i < n; i++) {
      const h = field.data[i * 2];
      min = Math.min(min, h);
      max = Math.max(max, h);
      sum += h;
    }
    const mean = sum / n;
    ok(min >= 0 && max <= 1, `${spec.kind}: height stays in range`);
    near(mean, 0.5, 0.06, `${spec.kind}: sheet is level on average`);
    ok(max - min > 0.05, `${spec.kind}: has actual tooth`);
  }

  // Rough is rougher than hot press, by construction and in fact.
  const rough = generatePaper(160, 120, PAPERS.rough, 11);
  const hot = generatePaper(160, 120, PAPERS["hot-press"], 11);
  const spread = (f: { data: Float32Array; width: number; height: number }) => {
    let lo = 1;
    let hi = 0;
    for (let i = 0; i < f.width * f.height; i++) {
      lo = Math.min(lo, f.data[i * 2]);
      hi = Math.max(hi, f.data[i * 2]);
    }
    return hi - lo;
  };
  ok(spread(rough) > spread(hot), "rough > hot press in relief");

  // Determinism: same seed, same sheet.
  const again = generatePaper(160, 120, PAPERS.rough, 11);
  ok(rough.data.every((v, i) => v === again.data[i]), "paper is reproducible from its seed");
}

// ---------------------------------------------------------------------------

if (failures > 0) {
  console.error(`\n${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${checks} checks passed.`);
