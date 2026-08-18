/**
 * The studio screen: sheet on the left (or on top, on a phone), paint box
 * beside it, and the wiring between pointer events, the brush model, the
 * mixing well, and the simulator.
 */

import { beginStroke, brushRadius, strokeTo, tapStamp, TOOLS, type StrokeState, type ToolId } from "../paint/brush";
import { DEFAULT_PIGMENT_ID, handlingNote, PIGMENT_BY_ID, type Pigment } from "../paint/pigments";
import { mixWell, wellName, type WellEntry } from "../paint/mix";
import { PAPERS, type PaperKind } from "../engine/paper";
import { Simulation } from "../engine/simulation";
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
    if (cured) showHint("That paint has dried and is cured. Lift works on damp washes — wet it first, or paint over it.");
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
      wellMeta.textContent = "clean water — dip a pigment";
    }
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

  // ---- toolbox -----------------------------------------------------------
  const toolButtons = new Map<string, HTMLButtonElement>();
  const selectTool = (id: ToolId | "salt") => {
    tool = id;
    for (const [key, btn] of toolButtons) btn.classList.toggle("is-active", key === id);
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
    sim.render(backlight ? 1 : 0);
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

  const actions = el(
    "div",
    { class: "action-col" },
    el("button", { class: "btn btn-primary", type: "button", onclick: () => sim.dryFast() }, "Dry the sheet"),
    backlightBtn,
    el("button", { class: "btn", type: "button", onclick: () => sim.undo() }, "Undo"),
    saveBtn,
    el("button", { class: "btn", type: "button", onclick: exportPNG }, "Export PNG"),
    confirmButton("Clear sheet", "Really clear?", () => sim.clearSheet())
  );

  const toolbox = el(
    "aside",
    { class: "toolbox" },
    el("section", { class: "box" }, el("h2", { class: "box-title" }, "Pigments"), wellRow, recentRow, palette.root),
    el(
      "section",
      { class: "box" },
      el("h2", { class: "box-title" }, "Brushes"),
      toolRow,
      el("div", { class: "slider-col" }, sizeCtl.root, waterCtl.root, loadCtl.root)
    ),
    el("section", { class: "box" }, el("h2", { class: "box-title" }, "Paper"), paperRow),
    el("section", { class: "box" }, el("h2", { class: "box-title" }, "Alive"), el("div", { class: "paper-row" }, foreverWetBtn, rainBtn)),
    el("section", { class: "box" }, el("h2", { class: "box-title" }, "Sheet"), actions)
  );

  const easel = el("div", { class: "easel" }, canvas, hint);
  host.append(el("div", { class: "studio container" }, easel, toolbox));
  fitCanvas();

  // ---- loop --------------------------------------------------------------
  let frameCount = 0;
  const frame = () => {
    fitCanvas();
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
