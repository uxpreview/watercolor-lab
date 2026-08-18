/**
 * The studio screen: sheet on the left, paint box on the right, and the
 * wiring between pointer events, the brush model, and the simulator.
 */

import { beginStroke, strokeTo, tapStamp, TOOLS, type StrokeState, type ToolId } from "../paint/brush";
import { DEFAULT_PIGMENT_ID, PIGMENT_BY_ID, type Pigment } from "../paint/pigments";
import { PAPERS, type PaperKind } from "../engine/paper";
import { Simulation } from "../engine/simulation";
import { confirmButton, el } from "./dom";
import { createPalette } from "./palette";

export const SIM_W = 1056;
export const SIM_H = 704;

/** The simulation grid. A `?sim=WxH` query overrides it — the scripted
 * figure and check harness runs under software GL, where full resolution
 * costs minutes per scene; the physics is resolution-independent enough for
 * judging at half size. */
function simDims(): { w: number; h: number } {
  const m = /[?&]sim=(\d+)x(\d+)/.exec(location.search);
  if (!m) return { w: SIM_W, h: SIM_H };
  return { w: Math.min(2048, Number(m[1])), h: Math.min(2048, Number(m[2])) };
}

/** Everything a scripted driver (the figures script, the visual checks, a
 * curious visitor with devtools open) can do that a pointer can do. */
export interface AppApi {
  sim: Simulation;
  setTool(id: ToolId | "salt"): void;
  setPigment(id: string): void;
  setSize(v: number): void;
  setWater(v: number): void;
  setLoad(v: number): void;
  setPaper(kind: PaperKind): void;
  setBacklight(on: boolean): void;
  /** Paints a path of sim-space points, stepping the physics as it goes. */
  strokePath(points: Array<{ x: number; y: number }>, stepsPerSegment?: number): void;
  salt(x: number, y: number): void;
  dry(): void;
  undo(): void;
  clear(): void;
  /** Deterministic fast-forward for scripts. */
  step(n: number, evapMul?: number): void;
}

const ICONS: Record<string, string> = {
  round: `<svg viewBox="0 0 24 24"><path d="M12 3c1.8 0 3.4 2.6 3.4 6.2 0 2.9-1 5.3-2.1 7.4-.5 1-.8 2.4-1.3 2.4s-.8-1.4-1.3-2.4c-1.1-2.1-2.1-4.5-2.1-7.4C8.6 5.6 10.2 3 12 3z" fill="currentColor"/></svg>`,
  mop: `<svg viewBox="0 0 24 24"><ellipse cx="12" cy="10" rx="6.5" ry="7" fill="currentColor" opacity="0.55"/><ellipse cx="12" cy="9" rx="4" ry="4.6" fill="currentColor"/></svg>`,
  rigger: `<svg viewBox="0 0 24 24"><path d="M11.4 3h1.2l.6 12.5c0 2.5-.5 5.5-1.2 5.5s-1.2-3-1.2-5.5L11.4 3z" fill="currentColor"/></svg>`,
  drybrush: `<svg viewBox="0 0 24 24"><g fill="currentColor"><rect x="4" y="5" width="2.1" height="14" rx="1"/><rect x="8.2" y="4" width="2.1" height="12" rx="1"/><rect x="12.4" y="6" width="2.1" height="14" rx="1"/><rect x="16.6" y="4.5" width="2.1" height="11" rx="1"/></g></svg>`,
  spatter: `<svg viewBox="0 0 24 24"><g fill="currentColor"><circle cx="7" cy="8" r="2.6"/><circle cx="15.5" cy="5.5" r="1.6"/><circle cx="18" cy="12" r="2.2"/><circle cx="10" cy="15.5" r="1.3"/><circle cx="15" cy="18.5" r="1.8"/><circle cx="5.5" cy="18" r="1"/></g></svg>`,
  water: `<svg viewBox="0 0 24 24"><path d="M12 3.5c2.8 3.9 6 7.6 6 11a6 6 0 1 1-12 0c0-3.4 3.2-7.1 6-11z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`,
  salt: `<svg viewBox="0 0 24 24"><g fill="currentColor"><path d="M12 4l1 2.2L15.2 7 13 8l-1 2.2L11 8l-2.2-1L11 6.2z"/><circle cx="6.5" cy="13.5" r="1.2"/><circle cx="12" cy="16" r="1.2"/><circle cx="17.5" cy="13.5" r="1.2"/><circle cx="9" cy="19.5" r="1"/><circle cx="15" cy="19.5" r="1"/></g></svg>`,
};

function iconButton(name: string, label: string, onClick: () => void): HTMLButtonElement {
  const btn = el("button", { class: "tool", type: "button", title: label, "aria-label": label, onclick: onClick });
  btn.innerHTML = ICONS[name] ?? "";
  btn.append(el("span", { class: "tool-label" }, label));
  return btn;
}

function slider(label: string, initial: number, onInput: (v: number) => void): { root: HTMLElement; set(v: number): void } {
  const input = el("input", {
    type: "range",
    min: "0",
    max: "1",
    step: "0.01",
    value: String(initial),
    oninput: () => onInput(Number(input.value)),
  }) as HTMLInputElement;
  const root = el("label", { class: "slider" }, el("span", { class: "slider-label" }, label), input);
  return {
    root,
    set(v: number) {
      input.value = String(v);
      onInput(v);
    },
  };
}

export function mountStudio(host: HTMLElement): AppApi {
  const canvas = el("canvas", { class: "sheet", "aria-label": "Watercolor paper. Draw here to paint." });

  // ---- state -------------------------------------------------------------
  let tool: ToolId | "salt" = "round";
  let pigment: Pigment = PIGMENT_BY_ID.get(DEFAULT_PIGMENT_ID)!;
  let size = 0.42;
  let water = 0.55;
  let load = 0.65;
  let backlight = false;
  let stroke: StrokeState | null = null;
  let strokeMoved = false;

  const dims = simDims();
  const sim = new Simulation(canvas, dims.w, dims.h);
  // `?seed=N` pins the sheet, so a scripted figure reproduces exactly; an
  // interactive visitor gets a fresh sheet every time, like a real pad.
  const seedMatch = /[?&]seed=(\d+)/.exec(location.search);
  if (seedMatch) {
    sim.paperSeed = Number(seedMatch[1]);
    sim.setPaper("cold-press", true, sim.paperSeed);
  }
  // Scripted scenes speak in reference coordinates (1056×704) so they render
  // the same composition at any sim size.
  const refScale = dims.w / SIM_W;

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
  });

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
        sim.splat(stamps, stroke.tool.pigment > 0 ? pigment : null);
      }
    }
  });

  const endStroke = (e: PointerEvent) => {
    if (stroke && !strokeMoved) {
      // A tap still leaves a mark — a loaded brush touched the sheet.
      const pressure = e.pressure > 0 ? e.pressure : 0.5;
      sim.splat([tapStamp(stroke, pressure)], stroke.tool.pigment > 0 ? pigment : null);
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

  // ---- toolbox -----------------------------------------------------------
  const palette = createPalette(DEFAULT_PIGMENT_ID);
  palette.onChange((p) => {
    pigment = p;
    if (tool === "water" || tool === "salt") selectTool("round");
  });

  const toolButtons = new Map<string, HTMLButtonElement>();
  const selectTool = (id: ToolId | "salt") => {
    tool = id;
    for (const [key, btn] of toolButtons) btn.classList.toggle("is-active", key === id);
  };
  const toolRow = el("div", { class: "tool-row", role: "toolbar", "aria-label": "Brushes" });
  const toolIds: Array<ToolId | "salt"> = ["round", "mop", "rigger", "drybrush", "spatter", "water", "salt"];
  for (const id of toolIds) {
    const label = id === "salt" ? "Salt" : TOOLS[id as ToolId].name;
    const btn = iconButton(id, label, () => selectTool(id));
    toolButtons.set(id, btn);
    toolRow.append(btn);
  }
  selectTool("round");

  const sizeCtl = slider("Size", size, (v) => (size = v));
  const waterCtl = slider("Water", water, (v) => (water = v));
  const loadCtl = slider("Pigment", load, (v) => (load = v));

  const paperRow = el("div", { class: "paper-row", role: "radiogroup", "aria-label": "Paper" });
  const paperButtons = new Map<PaperKind, HTMLButtonElement>();
  const selectPaper = (kind: PaperKind) => {
    sim.setPaper(kind);
    for (const [key, btn] of paperButtons) btn.setAttribute("aria-checked", String(key === kind));
  };
  for (const spec of Object.values(PAPERS)) {
    const btn = el(
      "button",
      { class: "btn btn-ghost btn-small", type: "button", role: "radio", "aria-checked": spec.kind === "cold-press", onclick: () => selectPaper(spec.kind) },
      spec.name
    );
    paperButtons.set(spec.kind, btn);
    paperRow.append(btn);
  }

  const backlightBtn = el(
    "button",
    { class: "btn btn-ghost", type: "button", "aria-pressed": "false", onclick: () => setBacklight(!backlight) },
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
    sim.render(backlight ? 1 : 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = el("a", { href: URL.createObjectURL(blob), download: "watercolor.png" });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, "image/png");
  };

  const actions = el(
    "div",
    { class: "action-col" },
    el("button", { class: "btn btn-primary", type: "button", onclick: () => sim.dryFast() }, "Dry the sheet"),
    backlightBtn,
    el("button", { class: "btn btn-ghost", type: "button", onclick: () => sim.undo() }, "Undo"),
    el("button", { class: "btn btn-ghost", type: "button", onclick: exportPNG }, "Export PNG"),
    confirmButton("Clear sheet", "Really clear?", () => sim.clearSheet())
  );

  const toolbox = el(
    "aside",
    { class: "toolbox" },
    el("section", { class: "box" }, el("h2", { class: "box-title" }, "Pigments"), palette.root),
    el(
      "section",
      { class: "box" },
      el("h2", { class: "box-title" }, "Brushes"),
      toolRow,
      el("div", { class: "slider-col" }, sizeCtl.root, waterCtl.root, loadCtl.root)
    ),
    el("section", { class: "box" }, el("h2", { class: "box-title" }, "Paper"), paperRow),
    el("section", { class: "box" }, el("h2", { class: "box-title" }, "Sheet"), actions)
  );

  const easel = el("div", { class: "easel" }, canvas);
  host.append(el("div", { class: "studio container" }, easel, toolbox));
  fitCanvas();

  // ---- loop --------------------------------------------------------------
  const frame = () => {
    fitCanvas();
    sim.update();
    sim.render(backlight ? 1 : 0);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // ---- scripted API ------------------------------------------------------
  const api: AppApi = {
    sim,
    setTool: selectTool,
    setPigment: (id) => {
      const p = PIGMENT_BY_ID.get(id);
      if (p) pigment = p;
    },
    setSize: (v) => sizeCtl.set(v),
    setWater: (v) => waterCtl.set(v),
    setLoad: (v) => loadCtl.set(v),
    setPaper: selectPaper,
    setBacklight,
    strokePath(points, stepsPerSegment = 2) {
      if (points.length === 0 || tool === "salt") return;
      sim.snapshot();
      const pts = points.map((p) => ({ x: p.x * refScale, y: p.y * refScale }));
      const s = beginStroke(TOOLS[tool as ToolId], size, water, load, pts[0].x, pts[0].y, 12345, refScale);
      for (let i = 1; i < pts.length; i++) {
        const stamps = strokeTo(s, pts[i].x, pts[i].y, 0.55);
        if (stamps.length > 0) sim.splat(stamps, s.tool.pigment > 0 ? pigment : null);
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
