/**
 * The studio screen: sheet on the left (or on top, on a phone), paint box
 * beside it, and the wiring between pointer events, the brush model, the
 * mixing well, and the simulator.
 */

import { beginStroke, brushRadius, strokeTo, tapStamp, TOOLS, type StrokeState, type ToolId } from "../paint/brush";
import { DEFAULT_PIGMENT_ID, handlingNote, PIGMENT_BY_ID, type Pigment } from "../paint/pigments";
import { mixWell, wellName, type WellEntry } from "../paint/mix";
import { PAPERS, type PaperKind } from "../engine/paper";
import { composite, layerRT, linearToSrgbByte, PAPER_REFLECTANCE, type Vec3 } from "../paint/km";
import { Simulation, XRAY_FIELDS, type XrayField } from "../engine/simulation";
import { loadSheet, saveSheet } from "../data/store";
import { fitDried } from "../data/resample";
import { confirmButton, el } from "./dom";
import { createPalette, paintChip } from "./palette";

export const SIM_W = 1056;
export const SIM_H = 704;

/** The simulation grid. Landscape 3:2 on a desk, portrait 2:3 on a phone —
 * a sheet is held the way the hand holding it is oriented. `?sim=WxH`
 * overrides both (the scripted figure harness uses it). */
function simDims(): { w: number; h: number } {
  const m = /[?&]sim=(\d+)x(\d+)/.exec(location.search);
  if (m) return { w: Math.min(2048, Number(m[1])), h: Math.min(2048, Number(m[2])) };
  const portrait = window.matchMedia("(max-width: 720px)").matches;
  return portrait ? { w: SIM_H, h: SIM_W } : { w: SIM_W, h: SIM_H };
}

export interface AppApi {
  sim: Simulation;
  setTool(id: ToolId | "salt"): void;
  setPigment(id: string): void;
  setSize(v: number): void;
  setWater(v: number): void;
  setLoad(v: number): void;
  setPaper(kind: PaperKind): void;
  setBacklight(on: boolean): void;
  /** The X-ray view: 0 is the painting, 1–6 one state field each. */
  setXray(field: XrayField): void;
  strokePath(points: Array<{ x: number; y: number }>, stepsPerSegment?: number): void;
  salt(x: number, y: number): void;
  dry(): void;
  undo(): void;
  clear(): void;
  step(n: number, evapMul?: number): void;
}

const ICONS: Record<string, string> = {
  round: `<svg viewBox="0 0 24 24"><path d="M12 3c1.8 0 3.4 2.6 3.4 6.2 0 2.9-1 5.3-2.1 7.4-.5 1-.8 2.4-1.3 2.4s-.8-1.4-1.3-2.4c-1.1-2.1-2.1-4.5-2.1-7.4C8.6 5.6 10.2 3 12 3z" fill="currentColor"/></svg>`,
  mop: `<svg viewBox="0 0 24 24"><ellipse cx="12" cy="10" rx="6.5" ry="7" fill="currentColor" opacity="0.55"/><ellipse cx="12" cy="9" rx="4" ry="4.6" fill="currentColor"/></svg>`,
  rigger: `<svg viewBox="0 0 24 24"><path d="M11.4 3h1.2l.6 12.5c0 2.5-.5 5.5-1.2 5.5s-1.2-3-1.2-5.5L11.4 3z" fill="currentColor"/></svg>`,
  drybrush: `<svg viewBox="0 0 24 24"><g fill="currentColor"><rect x="4" y="5" width="2.1" height="14" rx="1"/><rect x="8.2" y="4" width="2.1" height="12" rx="1"/><rect x="12.4" y="6" width="2.1" height="14" rx="1"/><rect x="16.6" y="4.5" width="2.1" height="11" rx="1"/></g></svg>`,
  spatter: `<svg viewBox="0 0 24 24"><g fill="currentColor"><circle cx="7" cy="8" r="2.6"/><circle cx="15.5" cy="5.5" r="1.6"/><circle cx="18" cy="12" r="2.2"/><circle cx="10" cy="15.5" r="1.3"/><circle cx="15" cy="18.5" r="1.8"/><circle cx="5.5" cy="18" r="1"/></g></svg>`,
  water: `<svg viewBox="0 0 24 24"><path d="M12 3.5c2.8 3.9 6 7.6 6 11a6 6 0 1 1-12 0c0-3.4 3.2-7.1 6-11z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`,
  lift: `<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="9" rx="3" fill="currentColor" opacity="0.8"/><path d="M8 17c0 1.2-.9 2.5-.9 2.5M12 17c0 1.2-.9 2.5-.9 2.5M16 17c0 1.2-.9 2.5-.9 2.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`,
  salt: `<svg viewBox="0 0 24 24"><g fill="currentColor"><path d="M12 4l1 2.2L15.2 7 13 8l-1 2.2L11 8l-2.2-1L11 6.2z"/><circle cx="6.5" cy="13.5" r="1.2"/><circle cx="12" cy="16" r="1.2"/><circle cx="17.5" cy="13.5" r="1.2"/><circle cx="9" cy="19.5" r="1"/><circle cx="15" cy="19.5" r="1"/></g></svg>`,
};

function iconButton(name: string, label: string, onClick: () => void): HTMLButtonElement {
  const btn = el("button", { class: "tool", type: "button", title: label, "aria-label": label, onclick: onClick });
  btn.innerHTML = ICONS[name] ?? "";
  btn.append(el("span", { class: "tool-label" }, label));
  return btn;
}

function slider(label: string, initial: number, onInput: (v: number) => void): { root: HTMLElement; set(v: number): void } {
  const readout = el("span", { class: "slider-value" }, String(Math.round(initial * 100)));
  const apply = (v: number) => {
    readout.textContent = String(Math.round(v * 100));
    onInput(v);
  };
  const input = el("input", {
    type: "range",
    min: "0",
    max: "1",
    step: "0.01",
    value: String(initial),
    oninput: () => apply(Number(input.value)),
  }) as HTMLInputElement;
  const root = el("label", { class: "slider" }, el("span", { class: "slider-label" }, label), input, readout);
  return {
    root,
    set(v: number) {
      input.value = String(v);
      apply(v);
    },
  };
}

export function mountStudio(host: HTMLElement): AppApi {
  const dims = simDims();
  const portrait = dims.h > dims.w;
  const canvas = el("canvas", {
    class: `sheet${portrait ? " is-portrait" : ""}`,
    "aria-label": "Watercolor paper. Draw here to paint.",
  });

  // ---- state -------------------------------------------------------------
  let tool: ToolId | "salt" = "round";
  let well: WellEntry[] = [{ pigment: PIGMENT_BY_ID.get(DEFAULT_PIGMENT_ID)!, parts: 1 }];
  let brushPigment: Pigment | null = mixWell(well);
  let mixMode = false;
  let size = 0.42;
  let water = 0.55;
  let load = 0.65;
  let backlight = false;
  let xray: XrayField = 0;
  let rain = false;
  let stroke: StrokeState | null = null;
  let strokeMoved = false;

  const sim = new Simulation(canvas, dims.w, dims.h);
  const scripted = /[?&](sim|seed)=/.test(location.search);
  const seedMatch = /[?&]seed=(\d+)/.exec(location.search);
  if (seedMatch) {
    sim.paperSeed = Number(seedMatch[1]);
    sim.setPaper("cold-press", true, sim.paperSeed);
  }
  const refScale = dims.w / (portrait ? SIM_H : SIM_W);

  // ---- canvas sizing -----------------------------------------------------
  const fitCanvas = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w;
      canvas.height = h;
    }
  };
  new ResizeObserver(fitCanvas).observe(canvas);

  const toSim = (e: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * dims.w,
      y: ((e.clientY - rect.top) / rect.height) * dims.h,
    };
  };

  // ---- painting ----------------------------------------------------------
  // ---- lift hint -----------------------------------------------------------
  // The lift tool re-suspends paint that has settled but not cured. Dried
  // paint is permanent, as on a real sheet, so scrubbing it does nothing —
  // say so once, instead of letting the silence read as a bug.
  const hint = el("p", { class: "sheet-hint", role: "status", "aria-live": "polite" });
  let hintTimer = 0;
  const showHint = (text: string) => {
    hint.textContent = text;
    hint.classList.add("is-visible");
    window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => hint.classList.remove("is-visible"), 3200);
  };
  const checkLiftTarget = (x: number, y: number) => {
    const probe = sim.probe(x, y, Math.min(12, brushRadius(TOOLS.lift, size) * 0.5));
    const cured = probe.dried > 0.02 && probe.workable < 0.004 && probe.wet < 0.02;
    if (cured) showHint("That paint has dried and is cured. Lift works on damp washes. Wet it first, or paint over it.");
  };

  let lastSalt = { x: -1e9, y: -1e9 };
  canvas.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const at = toSim(e);
    sim.snapshot();
    if (tool === "salt") {
      sim.addSalt(at.x, at.y);
      lastSalt = at;
      return;
    }
    stroke = beginStroke(TOOLS[tool], size, water, load, at.x, at.y, (e.pointerId + 1) * 7919);
    strokeMoved = false;
    if (tool === "lift") checkLiftTarget(at.x, at.y);
  });

  const strokePigment = () => (stroke && stroke.tool.pigment > 0 ? brushPigment : null);

  canvas.addEventListener("pointermove", (e) => {
    const events = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [e];
    if (tool === "salt") {
      if (e.buttons === 0) return;
      const at = toSim(e);
      if (Math.hypot(at.x - lastSalt.x, at.y - lastSalt.y) > 60) {
        sim.addSalt(at.x, at.y);
        lastSalt = at;
      }
      return;
    }
    if (!stroke) return;
    for (const ev of events) {
      const at = toSim(ev as PointerEvent);
      const pressure = (ev as PointerEvent).pressure > 0 ? (ev as PointerEvent).pressure : 0.5;
      const stamps = strokeTo(stroke, at.x, at.y, pressure);
      if (stamps.length > 0) {
        strokeMoved = true;
        sim.splat(stamps, strokePigment());
        if (stroke.tool.id === "lift") sim.addScrub(stamps);
      }
    }
  });

  const endStroke = (e: PointerEvent) => {
    if (stroke && !strokeMoved) {
      // A tap still leaves a mark — a loaded brush touched the sheet.
      const pressure = e.pressure > 0 ? e.pressure : 0.5;
      const stamp = tapStamp(stroke, pressure);
      sim.splat([stamp], strokePigment());
      if (stroke.tool.id === "lift") sim.addScrub([stamp]);
    }
    stroke = null;
  };
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);

  window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      sim.undo();
    }
    if (e.key === "[") sizeCtl.set(Math.max(0, size - 0.06));
    if (e.key === "]") sizeCtl.set(Math.min(1, size + 0.06));
  });

  // The brush preview lives further down; the well marks it stale and the
  // frame repaints it, so pigment changes and slider moves share one path.
  let previewDirty = false;

  // ---- the mixing well ---------------------------------------------------
  const WELL_CHIP = 44;
  const wellCanvas = el("canvas", { width: WELL_CHIP, height: WELL_CHIP, class: "well-swatch" });
  const wellName_ = el("span", { class: "pigment-name" });
  const wellMeta = el("span", { class: "pigment-meta" });
  const recentRow = el("div", { class: "recent-row", "aria-label": "Recent pigments" });
  let recents: Pigment[] = [];

  const renderWell = () => {
    const ctx2d = wellCanvas.getContext("2d")!;
    if (brushPigment) {
      paintChip(wellCanvas, brushPigment);
      wellName_.textContent = wellName(well);
      wellMeta.textContent =
        well.length > 1 ? `mix · ${handlingNote(brushPigment)}` : `${brushPigment.code} · ${handlingNote(brushPigment)}`;
    } else {
      ctx2d.fillStyle = "#f2ead9";
      ctx2d.fillRect(0, 0, WELL_CHIP, WELL_CHIP);
      wellName_.textContent = "Rinsed";
      wellMeta.textContent = "clean water. Dip a pigment";
    }
    previewDirty = true;
  };

  const renderRecents = () => {
    recentRow.replaceChildren(
      ...recents.map((p) => {
        const mini = el("canvas", { width: 28, height: 28, class: "chip-swatch" });
        paintChip(mini, p);
        return el(
          "button",
          { class: "chip chip-mini", type: "button", title: p.name, "aria-label": p.name, onclick: () => dip(p) },
          mini
        );
      })
    );
  };

  const dip = (p: Pigment) => {
    if (mixMode && well.length > 0) {
      const existing = well.find((e) => e.pigment.id === p.id);
      if (existing) existing.parts = Math.min(existing.parts + 1, 6);
      else if (well.length < 4) well.push({ pigment: p, parts: 1 });
    } else {
      well = [{ pigment: p, parts: 1 }];
    }
    brushPigment = mixWell(well);
    recents = [p, ...recents.filter((r) => r.id !== p.id)].slice(0, 6);
    if (tool === "water" || tool === "lift" || tool === "salt") selectTool("round");
    renderWell();
    renderRecents();
  };

  const rinse = () => {
    well = [];
    brushPigment = null;
    renderWell();
  };

  const mixBtn = el(
    "button",
    {
      class: "btn btn-small",
      type: "button",
      "aria-pressed": "false",
      title: "When on, dipping a pigment adds it to the mix instead of replacing it",
      onclick: () => {
        mixMode = !mixMode;
        mixBtn.setAttribute("aria-pressed", String(mixMode));
        mixBtn.classList.toggle("is-active", mixMode);
      },
    },
    "Mix"
  );

  const wellRow = el(
    "div",
    { class: "well-row" },
    wellCanvas,
    el("div", { class: "pigment-caption well-caption" }, wellName_, wellMeta),
    el("div", { class: "well-actions" }, mixBtn, el("button", { class: "btn btn-small", type: "button", onclick: rinse }, "Rinse"))
  );

  const palette = createPalette(DEFAULT_PIGMENT_ID);
  palette.onChange(dip);
  renderWell();

  // ---- the brush preview ---------------------------------------------------
  // What the sliders mean without a mark on the sheet: one dab of the current
  // brush, painted by the same Kubelka-Munk maths as the pans. Radius is the
  // brush's real radius against a fixed scale where the biggest brush fills
  // the box; water widens and softens the edge and thins the film; pigment
  // load sets the film's concentration. The line under it gives the true
  // size as a share of the sheet's width, which is the number that transfers.
  const PREVIEW = 96;
  const previewCanvas = el("canvas", { width: PREVIEW * 2, height: PREVIEW * 2, class: "brush-preview-canvas", "aria-hidden": "true" });
  const previewLine = el("p", { class: "brush-preview-line" });
  const renderPreview = () => {
    const ctx2d = previewCanvas.getContext("2d")!;
    const size2 = PREVIEW * 2;
    const image = ctx2d.createImageData(size2, size2);
    const [pr, pg, pb] = PAPER_REFLECTANCE;
    const isSalt = tool === "salt";
    const spec = isSalt ? null : TOOLS[tool as ToolId];
    const radiusSim = isSalt ? 46 : brushRadius(spec!, size);
    // The box is this brush at full size: the dab shows where the slider is
    // and how the film reads; the line beneath gives the true footprint.
    const fullRadius = isSalt ? 46 : brushRadius(spec!, 1);
    const radiusPx = (radiusSim / fullRadius) * (size2 / 2) * 0.86;
    const waterAmt = spec ? water * spec.water : 0;
    const pigmentAmt = spec ? load * spec.pigment : 0;
    // A stroke lays ~1/spacing overlapping stamps; the film's concentration
    // is that many splats' worth, thinned by the water it rides in.
    const conc = spec ? (pigmentAmt * 0.13 * (1 / spec.spacing)) / (0.55 + waterAmt) : 0;
    const feather = spec ? 0.08 + 0.42 * Math.min(1, waterAmt / 1.6) : 0.1;
    const wetDarken = spec ? 1 - 0.075 * Math.min(1, waterAmt) : 1;
    const r: Vec3 = [0, 0, 0];
    const t: Vec3 = [0, 0, 0];
    const out: Vec3 = [0, 0, 0];
    const cx = size2 / 2;
    const cy = size2 / 2;
    for (let y = 0; y < size2; y++) {
      for (let x = 0; x < size2; x++) {
        const d = Math.hypot(x - cx, y - cy) / Math.max(radiusPx, 1);
        // Solid core, feathered rim: the wet edge of a real dab.
        const inside = d <= 1 - feather ? 1 : d >= 1 ? 0 : (1 - d) / feather;
        let R = pr;
        let G = pg;
        let B = pb;
        if (inside > 0) {
          const dark = 1 - (1 - wetDarken) * inside;
          const paper: Vec3 = [pr * dark, pg * dark, pb * dark];
          if (brushPigment && conc > 0) {
            layerRT(brushPigment.k, brushPigment.s, conc * inside, r, t);
            composite(r, t, paper, out);
            R = out[0];
            G = out[1];
            B = out[2];
          } else {
            R = paper[0];
            G = paper[1];
            B = paper[2];
          }
        }
        const idx = (y * size2 + x) * 4;
        image.data[idx] = linearToSrgbByte(R);
        image.data[idx + 1] = linearToSrgbByte(G);
        image.data[idx + 2] = linearToSrgbByte(B);
        image.data[idx + 3] = 255;
      }
    }
    ctx2d.putImageData(image, 0, 0);
    if (isSalt) {
      // Salt is grains, not a film: a scatter of dots at the true throw radius.
      ctx2d.fillStyle = "#c9c2b0";
      let seed = 7;
      for (let i = 0; i < 24; i++) {
        seed = (seed * 16807) % 2147483647;
        const a = (seed / 2147483647) * Math.PI * 2;
        seed = (seed * 16807) % 2147483647;
        const dd = Math.sqrt(seed / 2147483647) * radiusPx;
        ctx2d.beginPath();
        ctx2d.arc(cx + Math.cos(a) * dd, cy + Math.sin(a) * dd, 2.2, 0, Math.PI * 2);
        ctx2d.fill();
      }
    }
    const share = Math.round(((radiusSim * 2) / dims.w) * 100);
    const what = isSalt ? "salt throw" : brushPigment && pigmentAmt > 0 ? "one dab" : "clean water";
    previewLine.textContent = `${what} · ${share}% of the sheet's width`;
  };

  // ---- the brush ring ------------------------------------------------------
  // On a desk the pointer wears the brush's true footprint over the sheet, so
  // size reads before a mark is made. Fine pointers only: a finger covers it.
  const ring = el("div", { class: "brush-ring", "aria-hidden": "true" });
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const moveRing = (e: PointerEvent) => {
    if (!finePointer) return;
    const rect = canvas.getBoundingClientRect();
    const host = easel.getBoundingClientRect();
    const scale = rect.width / dims.w;
    const radiusSim = tool === "salt" ? 46 : brushRadius(TOOLS[tool as ToolId], size);
    const px = radiusSim * scale;
    ring.style.width = `${px * 2}px`;
    ring.style.height = `${px * 2}px`;
    ring.style.transform = `translate(${e.clientX - host.left - px}px, ${e.clientY - host.top - px}px)`;
    ring.classList.add("is-visible");
  };
  canvas.addEventListener("pointermove", moveRing);
  canvas.addEventListener("pointerenter", moveRing);
  canvas.addEventListener("pointerleave", () => ring.classList.remove("is-visible"));

  // ---- focus ------------------------------------------------------------------
  // The sheet takes the whole window and the bench becomes a drawer. For a
  // desk that wants the biggest sheet it can get, and for a phone, where the
  // page's own chrome is most of the screen.
  let focus = false;
  let drawerOpen = false;
  const focusBtn = el(
    "button",
    { class: "btn", type: "button", "aria-pressed": "false", onclick: () => setFocus(!focus) },
    "Focus"
  );
  const drawerBtn = el(
    "button",
    { class: "btn focus-tools", type: "button", "aria-pressed": "false", "aria-expanded": "false", onclick: () => setDrawer(!drawerOpen) },
    "Tools"
  );
  const exitBtn = el("button", { class: "btn focus-exit", type: "button", onclick: () => setFocus(false) }, "Exit focus");
  const focusBar = el("div", { class: "focus-bar" }, drawerBtn, exitBtn);
  const setDrawer = (open: boolean) => {
    drawerOpen = open;
    document.body.classList.toggle("is-drawer-open", open);
    drawerBtn.setAttribute("aria-pressed", String(open));
    drawerBtn.setAttribute("aria-expanded", String(open));
    drawerBtn.classList.toggle("is-active", open);
  };
  const setFocus = (on: boolean) => {
    focus = on;
    document.body.classList.toggle("is-focus", on);
    focusBtn.setAttribute("aria-pressed", String(on));
    focusBtn.classList.toggle("is-active", on);
    focusBtn.textContent = on ? "Exit focus" : "Focus";
    if (!on) setDrawer(false);
    // The canvas' box changes size in the same frame; the observer catches it,
    // but the ring's cached rect is stale until the next move.
    ring.classList.remove("is-visible");
    layoutSheet();
    if (on) exitBtn.focus();
    else focusBtn.focus();
  };
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && focus) {
      if (drawerOpen) setDrawer(false);
      else setFocus(false);
    }
  });

  // ---- toolbox -----------------------------------------------------------
  const toolButtons = new Map<string, HTMLButtonElement>();
  const selectTool = (id: ToolId | "salt") => {
    tool = id;
    for (const [key, btn] of toolButtons) btn.classList.toggle("is-active", key === id);
    renderPreview();
  };
  const toolRow = el("div", { class: "tool-row", role: "toolbar", "aria-label": "Brushes" });
  const toolIds: Array<ToolId | "salt"> = ["round", "mop", "rigger", "drybrush", "spatter", "water", "lift", "salt"];
  for (const id of toolIds) {
    const label = id === "salt" ? "Salt" : TOOLS[id as ToolId].name;
    const btn = iconButton(id, label, () => selectTool(id));
    toolButtons.set(id, btn);
    toolRow.append(btn);
  }
  selectTool("round");

  const sizeCtl = slider("Size", size, (v) => {
    size = v;
    renderPreview();
  });
  const waterCtl = slider("Water", water, (v) => {
    water = v;
    renderPreview();
  });
  const loadCtl = slider("Pigment", load, (v) => {
    load = v;
    renderPreview();
  });
  renderPreview();

  const paperRow = el("div", { class: "paper-row", role: "radiogroup", "aria-label": "Paper" });
  const paperButtons = new Map<PaperKind, HTMLButtonElement>();
  const selectPaper = (kind: PaperKind) => {
    sim.setPaper(kind);
    for (const [key, btn] of paperButtons) btn.setAttribute("aria-checked", String(key === kind));
  };
  for (const spec of Object.values(PAPERS)) {
    const btn = el(
      "button",
      { class: "btn btn-small", type: "button", role: "radio", "aria-checked": spec.kind === "cold-press", onclick: () => selectPaper(spec.kind) },
      spec.name
    );
    paperButtons.set(spec.kind, btn);
    paperRow.append(btn);
  }

  // ---- alive modes -------------------------------------------------------
  const foreverWetBtn = el(
    "button",
    {
      class: "btn btn-small",
      type: "button",
      "aria-pressed": "false",
      title: "Evaporation off: the sheet stays workable forever",
      onclick: () => {
        sim.foreverWet = !sim.foreverWet;
        foreverWetBtn.setAttribute("aria-pressed", String(sim.foreverWet));
        foreverWetBtn.classList.toggle("is-active", sim.foreverWet);
      },
    },
    "Forever wet"
  );
  const rainBtn = el(
    "button",
    {
      class: "btn btn-small",
      type: "button",
      "aria-pressed": "false",
      title: "Clean water falls on the sheet and works your paint over",
      onclick: () => {
        rain = !rain;
        rainBtn.setAttribute("aria-pressed", String(rain));
        rainBtn.classList.toggle("is-active", rain);
      },
    },
    "Rain"
  );

  // ---- x-ray ---------------------------------------------------------------
  // The state textures themselves, one field at a time. An inspection mode,
  // not an effect: every pixel is one number from the simulation, on a fixed
  // scale, so a wash reads the same shade from one moment to the next.
  const xrayRow = el("div", { class: "paper-row", role: "radiogroup", "aria-label": "X-ray view" });
  const xrayButtons = new Map<XrayField, HTMLButtonElement>();
  const xrayWhat = el("p", { class: "xray-what" });
  const xrayRamp = el(
    "div",
    { class: "xray-ramp", "aria-hidden": "true" },
    el("span", { class: "xray-ramp-bar" }),
    el("span", { class: "xray-ramp-ends" }, el("span", {}, "0"), el("span", { class: "xray-ramp-unit" }))
  );
  const setXray = (field: XrayField) => {
    xray = field;
    const spec = XRAY_FIELDS[field];
    for (const [key, btn] of xrayButtons) btn.setAttribute("aria-checked", String(key === field));
    xrayWhat.textContent = spec.what;
    xrayRamp.hidden = field === 0;
    (xrayRamp.querySelector(".xray-ramp-unit") as HTMLElement).textContent = `${spec.unit} · full ink past ${Number((spec.scale * 3).toPrecision(2))}`;
    document.body.classList.toggle("is-xray", field !== 0);
  };
  for (const key of [0, 1, 2, 3, 4, 5, 6] as XrayField[]) {
    const spec = XRAY_FIELDS[key];
    const btn = el(
      "button",
      { class: "btn btn-small", type: "button", role: "radio", "aria-checked": "false", onclick: () => setXray(key) },
      spec.name
    );
    xrayButtons.set(key, btn);
    xrayRow.append(btn);
  }
  setXray(0);

  // ---- actions -----------------------------------------------------------
  const backlightBtn = el(
    "button",
    { class: "btn", type: "button", "aria-pressed": "false", onclick: () => setBacklight(!backlight) },
    "Backlight"
  );
  const setBacklight = (on: boolean) => {
    backlight = on;
    backlightBtn.setAttribute("aria-pressed", String(on));
    backlightBtn.classList.toggle("is-active", on);
    document.body.classList.toggle("is-backlit", on);
  };

  const exportPNG = () => {
    sim.update();
    sim.render(backlight ? 1 : 0, xray);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = el("a", { href: URL.createObjectURL(blob), download: "watercolor.png" });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, "image/png");
  };

  // Save dries the sheet first — the wet layer is not part of the document,
  // same as walking away from a real painting overnight.
  const saveBtn = el(
    "button",
    {
      class: "btn",
      type: "button",
      onclick: async () => {
        saveBtn.textContent = "Drying…";
        (saveBtn as HTMLButtonElement).disabled = true;
        sim.stepMany(500, 28);
        const dried = sim.serializeDried();
        if (dried) {
          try {
            await saveSheet({
              width: sim.simWidth,
              height: sim.simHeight,
              paperKind: sim.paperKind,
              paperSeed: sim.paperSeed,
              dried,
              savedAt: Date.now(),
            });
            saveBtn.textContent = "Saved";
          } catch {
            saveBtn.textContent = "Save failed";
          }
        } else {
          saveBtn.textContent = "Save failed";
        }
        setTimeout(() => {
          saveBtn.textContent = "Save sheet";
          (saveBtn as HTMLButtonElement).disabled = false;
        }, 1600);
      },
    },
    "Save sheet"
  );

  if (!scripted) {
    loadSheet().then((rec) => {
      if (!rec || rec.width <= 0 || rec.height <= 0) return;
      if (rec.dried.length !== rec.width * rec.height * 4) return;
      // A sheet saved on a desk (landscape) restores on a phone (portrait)
      // and back: scaled to fit, centred, margins bare paper.
      const dried = fitDried(rec.dried, rec.width, rec.height, sim.simWidth, sim.simHeight);
      sim.setPaper(rec.paperKind, true, rec.paperSeed);
      sim.restoreDried(dried);
    });
  }

  // The actions are one strip under the sheet, in reach without a scroll:
  // the committing action filled, the rest outlined, Focus on the far end.
  const actions = el(
    "div",
    { class: "action-bar" },
    el("button", { class: "btn btn-primary", type: "button", onclick: () => sim.dryFast() }, "Dry the sheet"),
    backlightBtn,
    el("button", { class: "btn", type: "button", onclick: () => sim.undo() }, "Undo"),
    saveBtn,
    el("button", { class: "btn", type: "button", onclick: exportPNG }, "Export PNG"),
    confirmButton("Clear sheet", "Really clear?", () => sim.clearSheet()),
    el("span", { class: "action-spacer" }),
    focusBtn
  );

  // A box is a section on a desk and a collapsible on a phone, where the
  // bench is a column under the sheet and every closed box is one less
  // screen to scroll past. Pigments and Brushes start open; the rest closed.
  const phone = window.matchMedia("(max-width: 720px)").matches;
  const box = (title: string, open: boolean, cls: string, ...children: (HTMLElement | null)[]): HTMLElement => {
    if (!phone) return el("section", { class: `box ${cls}` }, el("h2", { class: "box-title" }, title), ...children);
    return el(
      "details",
      { class: `box ${cls}`, open: open ? true : null },
      el("summary", { class: "box-title" }, title),
      ...children
    );
  };
  const subRow = (label: string, row: HTMLElement) => el("div", { class: "sub-row" }, el("h3", { class: "sub-title" }, label), row);

  const bench = el(
    "aside",
    { class: "bench" },
    box("Pigments", true, "box-pigments", wellRow, recentRow, palette.root),
    box(
      "Brushes",
      true,
      "box-brushes",
      toolRow,
      el(
        "div",
        { class: "brush-controls" },
        el("div", { class: "slider-col" }, sizeCtl.root, waterCtl.root, loadCtl.root),
        el("div", { class: "brush-preview" }, previewCanvas, previewLine)
      )
    ),
    box("Paper", false, "box-paper", paperRow, subRow("Alive", el("div", { class: "paper-row" }, foreverWetBtn, rainBtn))),
    box("X-ray", false, "box-xray", xrayRow, xrayWhat, xrayRamp)
  );

  const easel = el("div", { class: "easel" }, canvas, ring, hint);
  host.append(el("div", { class: "studio container" }, easel, actions, bench, focusBar));

  // ---- sheet sizing -------------------------------------------------------
  // The biggest sheet of the right aspect that fits the desk's width and,
  // on a desk, leaves the action strip and the bench in view beneath it: the
  // whole studio in one screen, no scrolling to reach a control. In focus
  // the window is the desk. A canvas cannot be left to CSS for this: a
  // replaced element with an explicit width does not give height back to
  // width when a max-height bites, it stretches.
  const studioPadX = () => {
    const st = getComputedStyle(easel.parentElement as HTMLElement);
    return parseFloat(st.paddingLeft) + parseFloat(st.paddingRight);
  };
  const layoutSheet = () => {
    const aspect = dims.w / dims.h;
    const style = getComputedStyle(easel);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    // The desk wraps the sheet, so the width on offer is the studio's, not
    // the desk's own (which would be circular); in focus it is the window's.
    const room = focus
      ? window.innerWidth
      : portrait
        ? easel.clientWidth // the desk is stretched edge to edge on a phone
        : (easel.parentElement as HTMLElement).clientWidth - studioPadX();
    const availW = Math.max(120, room - padX - 2);
    let capH: number;
    if (focus) {
      // The strip and the focus buttons sit under the sheet, not over it.
      capH = window.innerHeight - padY - (portrait ? 112 : 64);
    } else if (portrait) {
      capH = Infinity;
    } else {
      // Room for the strip and the bench under the sheet, plus the gaps.
      const below = actions.offsetHeight + bench.offsetHeight + 16 * 2 + padY + 4;
      capH = Math.max(320, window.innerHeight - below);
    }
    const w = Math.min(availW, capH * aspect);
    canvas.style.width = `${Math.floor(w)}px`;
    canvas.style.height = `${Math.floor(w / aspect)}px`;
  };
  new ResizeObserver(layoutSheet).observe(easel.parentElement as HTMLElement);
  new ResizeObserver(layoutSheet).observe(bench);
  window.addEventListener("resize", layoutSheet);
  layoutSheet();
  fitCanvas();

  // ---- loop --------------------------------------------------------------
  let frameCount = 0;
  const frame = () => {
    fitCanvas();
    if (previewDirty) {
      previewDirty = false;
      renderPreview();
    }
    if (rain && frameCount++ % 10 === 0) {
      const drops = [];
      for (let i = 0; i < 2; i++) {
        drops.push({
          x: Math.random() * dims.w,
          y: Math.random() * dims.h,
          radius: 3 + Math.random() * 7,
          water: 0.5 + Math.random(),
          pigment: 0,
          dryness: 0,
        });
      }
      sim.splat(drops, null);
    }
    sim.update();
    sim.render(backlight ? 1 : 0, xray);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // ---- scripted API ------------------------------------------------------
  const api: AppApi = {
    sim,
    setTool: selectTool,
    setPigment: (id) => {
      const p = PIGMENT_BY_ID.get(id);
      if (p) {
        well = [{ pigment: p, parts: 1 }];
        brushPigment = mixWell(well);
        renderWell();
      }
    },
    setSize: (v) => sizeCtl.set(v),
    setWater: (v) => waterCtl.set(v),
    setLoad: (v) => loadCtl.set(v),
    setPaper: selectPaper,
    setBacklight,
    setXray,
    strokePath(points, stepsPerSegment = 2) {
      if (points.length === 0 || tool === "salt") return;
      sim.snapshot();
      const pts = points.map((p) => ({ x: p.x * refScale, y: p.y * refScale }));
      const s = beginStroke(TOOLS[tool as ToolId], size, water, load, pts[0].x, pts[0].y, 12345, refScale);
      for (let i = 1; i < pts.length; i++) {
        const stamps = strokeTo(s, pts[i].x, pts[i].y, 0.55);
        if (stamps.length > 0) sim.splat(stamps, s.tool.pigment > 0 ? brushPigment : null);
        sim.stepMany(stepsPerSegment);
      }
    },
    salt: (x, y) => sim.addSalt(x * refScale, y * refScale, 46 * refScale, 424242),
    dry: () => sim.dryFast(),
    undo: () => sim.undo(),
    clear: () => sim.clearSheet(),
    step: (n, evapMul = 1) => sim.stepMany(n, evapMul),
  };
  return api;
}
