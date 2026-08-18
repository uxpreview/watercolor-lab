/**
 * Scripted painting scenes, shared by the README figure generator and the
 * visual checks. Stroke plans are computed here in Node with a seeded RNG —
 * jittered rows, wavy envelopes, varied endpoints — because periodicity is
 * the loudest digital tell there is: evenly spaced stroke rows dry into
 * ruler-straight seams no painter could produce. The browser side is one
 * small interpreter (RUN) fed a data program.
 *
 * Scene space is 1056×704 (the reference sim grid).
 */

/** Mulberry32, seeded per scene: plans are reproducible, never uniform. */
function rng(seed) {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A filled wash: back-and-forth rows with jittered spacing, wavy travel,
 * varied endpoints, and an optional tilt — the way an arm actually fills a
 * shape. */
function washRows(r, { x0, x1, y0, y1, rows, tilt = 0, wobble = 8 }) {
  const pts = [];
  let y = y0;
  const step = (y1 - y0) / (rows - 1);
  for (let row = 0; row < rows; row++) {
    const leftFirst = row % 2 === 0;
    const xa = x0 + (r() - 0.5) * 36;
    const xb = x1 + (r() - 0.5) * 36;
    const from = leftFirst ? xa : xb;
    const to = leftFirst ? xb : xa;
    const n = Math.max(6, Math.round(Math.abs(to - from) / 34));
    for (let i = 0; i <= n; i++) {
      const x = from + ((to - from) * i) / n;
      pts.push({
        x,
        y: y + (x - x0) * tilt + Math.sin(x * 0.021 + row * 2.1) * wobble * r(),
      });
    }
    y += step * (0.75 + 0.5 * r());
  }
  return pts;
}

/** One shared interpreter, serialized into the page. `data.program` is a
 * list of ops mirroring the AppApi. */
export const RUN = (api, data) => {
  for (const op of data.program) {
    const [kind, a, b, c] = op;
    if (kind === "paper") api.setPaper(a);
    else if (kind === "tool") api.setTool(a);
    else if (kind === "pig") api.setPigment(a);
    else if (kind === "size") api.setSize(a);
    else if (kind === "water") api.setWater(a);
    else if (kind === "load") api.setLoad(a);
    else if (kind === "path") api.strokePath(a, b ?? 1);
    else if (kind === "step") api.step(a, b ?? 1);
    else if (kind === "salt") api.salt(a, b);
    else if (kind === "backlight") api.setBacklight(a);
  }
};

function flatWash() {
  const r = rng(101);
  return [
    ["paper", "cold-press"],
    ["tool", "round"],
    ["pig", "cobalt-blue"],
    ["size", 0.8],
    ["water", 0.62],
    ["load", 0.62],
    ["path", washRows(r, { x0: 200, x1: 856, y0: 168, y1: 486, rows: 6, tilt: 0.02 })],
    ["step", 260],
    ["step", 420, 65],
  ];
}

function wetOnWet() {
  const r = rng(202);
  const program = [
    ["paper", "cold-press"],
    ["tool", "water"],
    ["size", 0.9],
    ["water", 0.95],
    ["path", washRows(r, { x0: 150, x1: 910, y0: 120, y1: 580, rows: 7, wobble: 12 })],
    ["step", 70],
    ["tool", "round"],
    ["size", 0.62],
    ["water", 0.7],
    ["load", 0.95],
    // The blue is dropped half into the rose so the two mingle in the water.
    ["pig", "quinacridone-rose"],
    ["path", [{ x: 350, y: 280 }, { x: 430, y: 315 }, { x: 385, y: 390 }, { x: 330, y: 340 }], 2],
    ["pig", "phthalo-blue"],
    ["path", [{ x: 470, y: 300 }, { x: 560, y: 275 }, { x: 610, y: 350 }, { x: 540, y: 395 }], 2],
    ["pig", "indian-yellow"],
    ["path", [{ x: 430, y: 470 }, { x: 520, y: 445 }, { x: 580, y: 480 }], 2],
    ["step", 360],
    ["step", 420, 65],
  ];
  return program;
}

function glaze() {
  const r = rng(303);
  return [
    ["paper", "cold-press"],
    ["tool", "round"],
    ["size", 0.72],
    ["water", 0.55],
    ["load", 0.7],
    ["pig", "french-ultramarine"],
    ["path", washRows(r, { x0: 150, x1: 900, y0: 252, y1: 360, rows: 3, tilt: -0.03 })],
    ["step", 90],
    ["step", 420, 65],
    ["pig", "burnt-sienna"],
    // The crossing band leans a few degrees and its columns overlap so no
    // straight seam survives between passes.
    ["path", (() => {
      const pts = [];
      for (let col = 0; col < 4; col++) {
        const x = 470 + col * 40 + (r() - 0.5) * 14;
        const down = col % 2 === 0;
        const ys = down ? [112, 588] : [588, 112];
        const n = 15;
        for (let i = 0; i <= n; i++) {
          const y = ys[0] + ((ys[1] - ys[0]) * i) / n;
          pts.push({ x: x + (y - 350) * 0.04 + Math.sin(y * 0.02 + col) * 5 * r(), y });
        }
      }
      return pts;
    })()],
    ["step", 90],
    ["step", 420, 65],
  ];
}

function granulation() {
  const r = rng(404);
  return [
    ["paper", "rough"],
    ["tool", "round"],
    ["size", 0.85],
    ["water", 0.8],
    ["load", 0.9],
    ["pig", "french-ultramarine"],
    ["path", washRows(r, { x0: 210, x1: 850, y0: 158, y1: 520, rows: 6, tilt: -0.025, wobble: 14 })],
    ["step", 90],
    ["step", 460, 65],
  ];
}

function drybrush() {
  const r = rng(505);
  const stroke = (x0, y0, x1, y1) => {
    const n = 9;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * (r() - 0.5) * 26 });
    }
    return pts;
  };
  return [
    ["paper", "rough"],
    ["tool", "drybrush"],
    ["size", 0.62],
    ["water", 0.15],
    ["load", 0.95],
    ["pig", "burnt-sienna"],
    ["path", stroke(155, 262, 902, 234), 1],
    ["path", stroke(198, 372, 838, 392), 1],
    ["pig", "paynes-gray"],
    ["path", stroke(170, 470, 878, 448), 1],
    ["step", 110],
    ["step", 240, 65],
  ];
}

function salt() {
  const r = rng(606);
  const program = [
    ["paper", "cold-press"],
    ["tool", "round"],
    ["size", 0.85],
    ["water", 0.75],
    ["load", 0.75],
    ["pig", "cerulean-blue"],
    ["path", washRows(r, { x0: 215, x1: 845, y0: 186, y1: 512, rows: 5, wobble: 12 })],
    ["step", 90],
  ];
  // Salt is thrown, not placed: scattered across most of the wash.
  for (let i = 0; i < 8; i++) {
    program.push(["salt", 280 + r() * 500, 230 + r() * 240]);
  }
  program.push(["step", 360], ["step", 460, 65]);
  return program;
}

function backruns() {
  const r = rng(707);
  return [
    ["paper", "cold-press"],
    ["tool", "round"],
    ["size", 0.75],
    ["water", 0.6],
    ["load", 0.68],
    ["pig", "alizarin-crimson"],
    ["path", washRows(r, { x0: 235, x1: 825, y0: 198, y1: 500, rows: 5, tilt: 0.015 })],
    ["step", 240],
    ["tool", "water"],
    ["size", 0.55],
    ["water", 1.0],
    ["path", [{ x: 470, y: 330 }, { x: 520, y: 355 }, { x: 495, y: 305 }, { x: 540, y: 330 }], 2],
    ["step", 400],
    ["step", 460, 65],
  ];
}

function landscape() {
  const r = rng(808);
  // Dusk over the hills: the whole sky blended wet-on-wet (the engine's
  // best trick), then one dark ragged ridge on the dried sheet. Two stages;
  // everything the medium is good at, nothing it is bad at.
  const program = [
    ["paper", "cold-press"],
    ["tool", "water"],
    ["size", 0.9],
    ["water", 0.9],
    ["path", washRows(r, { x0: 105, x1: 950, y0: 55, y1: 500, rows: 6, wobble: 10 })],
    ["tool", "round"],
    ["size", 0.7],
    ["water", 0.55],
    // Gold low, rose through the middle, cobalt evening blue above --
    // floated in while the sheet is wet so they grade into each other.
    ["load", 0.2],
    ["pig", "indian-yellow"],
    ["path", washRows(r, { x0: 210, x1: 850, y0: 340, y1: 425, rows: 2 })],
    ["load", 0.16],
    ["pig", "quinacridone-rose"],
    ["path", washRows(r, { x0: 185, x1: 880, y0: 215, y1: 300, rows: 2 })],
    ["load", 0.3],
    ["pig", "cobalt-blue"],
    ["path", washRows(r, { x0: 160, x1: 900, y0: 70, y1: 185, rows: 3 })],
    ["step", 200],
    ["step", 560, 65],
  ];
  // The ridge: near-black neutral, hard ragged edge against the lit sky.
  const ridgeTop = (x) =>
    502 - 56 * Math.exp(-Math.pow((x - 405) / 160, 2)) - 30 * Math.exp(-Math.pow((x - 700) / 100, 2));
  program.push(["size", 0.42], ["water", 0.38], ["load", 0.9], ["pig", "neutral-tint"]);
  for (let pass = 0; pass < 5; pass++) {
    const line = [];
    for (let x = 150; x <= 905; x += 20) {
      line.push({ x: x + (r() - 0.5) * 8, y: Math.min(575, ridgeTop(x) + 4 + pass * 16 + (r() - 0.5) * 5) });
    }
    program.push(["path", line]);
  }
  program.push(["path", [{ x: 158, y: 572 }, { x: 898, y: 573 }]]);
  program.push(["step", 60], ["step", 520, 65]);
  return program;
}

export const SCENES = [
  { name: "flat-wash", about: "A flat cobalt wash on cold press, dried: darkened rim, tide lines, tooth.", seed: 11, program: flatWash() },
  { name: "wet-on-wet", about: "Pigment dropped into a wet sheet: feathered blooms mingling where they meet.", seed: 22, program: wetOnWet() },
  { name: "glaze", about: "Burnt sienna glazed over dried ultramarine: the overlap is a dull pigment neutral.", seed: 33, program: glaze() },
  { name: "granulation", about: "Heavy French ultramarine on rough paper: particulate settling into the tooth.", seed: 44, program: granulation() },
  { name: "drybrush", about: "A starved brush dragged over rough paper: hard flecks on the peaks.", seed: 55, program: drybrush() },
  { name: "salt", about: "Salt thrown across a damp cerulean wash: pale stars with pushed rims.", seed: 66, program: salt() },
  { name: "backruns", about: "Clean water shoved into a drying alizarin wash: a cauliflower-edged bloom.", seed: 77, program: backruns() },
  { name: "landscape", about: "The postcard: graded sky, granulating ridge, sparkling water, rigger grasses.", seed: 88, program: landscape() },
];
