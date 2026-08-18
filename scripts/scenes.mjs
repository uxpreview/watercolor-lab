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
    ["size", 0.52],
    ["water", 0.55],
    ["load", 0.95],
    // Close enough that the blooms meet and mingle.
    ["pig", "quinacridone-rose"],
    ["path", [{ x: 385, y: 300 }, { x: 435, y: 330 }, { x: 405, y: 385 }], 2],
    ["pig", "phthalo-blue"],
    ["path", [{ x: 555, y: 285 }, { x: 605, y: 315 }, { x: 585, y: 380 }], 2],
    ["pig", "indian-yellow"],
    ["path", [{ x: 465, y: 445 }, { x: 520, y: 430 }], 2],
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
  const program = [
    ["paper", "cold-press"],
    // Sky: wet the upper sheet, float in cerulean, a breath of rose above
    // the horizon.
    ["tool", "water"],
    ["size", 0.9],
    ["water", 0.95],
    ["path", washRows(r, { x0: 95, x1: 962, y0: 75, y1: 385, rows: 6, wobble: 10 })],
    ["tool", "round"],
    ["size", 0.68],
    ["water", 0.6],
    ["load", 0.4],
    ["pig", "cerulean-blue"],
    ["path", washRows(r, { x0: 130, x1: 930, y0: 98, y1: 160, rows: 2, tilt: 0.012 })],
    ["load", 0.14],
    ["pig", "quinacridone-rose"],
    ["path", [{ x: 140, y: 268 }, { x: 920, y: 262 }]],
    ["step", 260],
    ["step", 420, 65],
  ];
  // Mountain: a low two-peak ridge, three overlapping passes.
  const ridge = (x) =>
    372 - 88 * Math.exp(-Math.pow((x - 415) / 155, 2)) - 46 * Math.exp(-Math.pow((x - 705) / 115, 2));
  program.push(["size", 0.5], ["water", 0.5], ["load", 0.72], ["pig", "french-ultramarine"]);
  for (let pass = 0; pass < 3; pass++) {
    const line = [];
    for (let x = 150; x <= 910; x += 22) {
      line.push({ x: x + (r() - 0.5) * 8, y: Math.min(398, ridge(x) + 5 + pass * 12 + (r() - 0.5) * 6) });
    }
    program.push(["path", line]);
  }
  program.push(["path", [{ x: 158, y: 395 }, { x: 902, y: 396 }]]);
  program.push(["step", 200], ["step", 420, 65]);
  // Water: pale pulls with dry-paper sparkle gaps, then soft reflections.
  program.push(
    ["load", 0.3],
    ["water", 0.6],
    ["pig", "cobalt-blue"],
    ["path", [{ x: 170, y: 447 }, { x: 888, y: 442 }]],
    ["path", [{ x: 858, y: 490 }, { x: 205, y: 495 }]],
    ["path", [{ x: 262, y: 542 }, { x: 798, y: 538 }]],
    ["load", 0.26],
    ["pig", "french-ultramarine"],
    ["path", [{ x: 412, y: 418 }, { x: 424, y: 508 }]],
    ["path", [{ x: 692, y: 415 }, { x: 700, y: 482 }]],
    ["step", 260],
    ["step", 460, 65]
  );
  // Foreground: a quiet green bank and a handful of rigger grasses.
  program.push(
    ["tool", "round"],
    ["size", 0.55],
    ["water", 0.5],
    ["load", 0.55],
    ["pig", "sap-green"],
    ["path", washRows(r, { x0: 130, x1: 930, y0: 606, y1: 664, rows: 2, wobble: 10 })],
    ["step", 120],
    ["tool", "rigger"],
    ["size", 0.42],
    ["water", 0.35],
    ["load", 0.9]
  );
  const grassPigs = ["sap-green", "sap-green", "burnt-sienna", "sap-green", "hookers-green", "burnt-sienna"];
  let gx = 175;
  for (let i = 0; i < grassPigs.length; i++) {
    gx += 18 + r() * 30;
    const h = 42 + r() * 34;
    const lean = (r() - 0.5) * 26;
    program.push(["pig", grassPigs[i]], ["path", [{ x: gx, y: 668 }, { x: gx + lean, y: 668 - h }]]);
  }
  program.push(["step", 90], ["step", 380, 65]);
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
