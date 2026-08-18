/**
 * The pigment palette. Every chip is painted by the same Kubelka-Munk maths
 * the simulator renders with — a thickness ramp of the pigment over the
 * sheet's own reflectance — so the chip is an honest preview of the wash, not
 * a hex swatch that the physics then disagrees with.
 */

import { composite, layerRT, linearToSrgbByte, PAPER_REFLECTANCE, type Vec3 } from "../paint/km";
import { handlingNote, handlingSentence, pigmentFacts, PIGMENTS, type Pigment } from "../paint/pigments";
import { el } from "./dom";

const CHIP = 44;

/** Paints any K/S pair as a thickness-ramp chip — the palette pans, the well
 * swatch, and the recents row all go through here so every swatch in the app
 * is the same physics. */
export function paintChip(canvas: HTMLCanvasElement, pigment: Pick<Pigment, "k" | "s">): void {
  const ctx = canvas.getContext("2d")!;
  const size = canvas.width;
  const image = ctx.createImageData(size, size);
  const r: Vec3 = [0, 0, 0];
  const t: Vec3 = [0, 0, 0];
  const out: Vec3 = [0, 0, 0];
  for (let y = 0; y < size; y++) {
    // Full-strength at the top of the chip down to a pale tint: the diagonal
    // read a tube swatch gives you.
    for (let x = 0; x < size; x++) {
      const mix = (y / size) * 0.85 + (x / size) * 0.15;
      const thickness = 3.6 * Math.pow(1 - mix, 2.1) + 0.05;
      layerRT(pigment.k, pigment.s, thickness, r, t);
      composite(r, t, PAPER_REFLECTANCE, out);
      const idx = (y * size + x) * 4;
      image.data[idx] = linearToSrgbByte(out[0]);
      image.data[idx + 1] = linearToSrgbByte(out[1]);
      image.data[idx + 2] = linearToSrgbByte(out[2]);
      image.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

/** A masstone-to-tint ramp, one KM layer thinning left to right over the
 * sheet, for the detail card. Same maths as the chip, laid out as a strip. */
export function paintRamp(canvas: HTMLCanvasElement, pigment: Pick<Pigment, "k" | "s">): void {
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width;
  const h = canvas.height;
  const image = ctx.createImageData(w, h);
  const r: Vec3 = [0, 0, 0];
  const t: Vec3 = [0, 0, 0];
  const out: Vec3 = [0, 0, 0];
  for (let x = 0; x < w; x++) {
    const thickness = 3.6 * Math.pow(1 - x / (w - 1), 2.1) + 0.02;
    layerRT(pigment.k, pigment.s, thickness, r, t);
    composite(r, t, PAPER_REFLECTANCE, out);
    const px = [linearToSrgbByte(out[0]), linearToSrgbByte(out[1]), linearToSrgbByte(out[2])];
    for (let y = 0; y < h; y++) {
      const idx = (y * w + x) * 4;
      image.data[idx] = px[0];
      image.data[idx + 1] = px[1];
      image.data[idx + 2] = px[2];
      image.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
}

/** How long a finger has to stay on a pan before it is a question, not a
 * choice. Under the platform's own long-press (~500 ms) so the context menu
 * never wins the race on a phone. */
const HOLD_MS = 420;

/**
 * The pigment detail card: the declared numbers, a masstone-to-tint ramp, and
 * one sentence on handling — all read from the same record the physics uses.
 * Opened by press-and-hold on a pan (any pointer), or right-click; closed by
 * its button, Escape, a tap anywhere else, or choosing another pan.
 */
function pigmentCard(pigment: Pigment, onClose: () => void): HTMLElement {
  const ramp = el("canvas", { width: 240, height: 22, class: "card-ramp-canvas", "aria-hidden": "true" });
  paintRamp(ramp, pigment);
  const facts = el("dl", { class: "card-facts" });
  for (const f of pigmentFacts(pigment)) {
    facts.append(
      el(
        "div",
        { class: "card-fact" },
        el("dt", {}, f.label),
        el(
          "dd",
          {},
          el("span", { class: "card-meter", "aria-hidden": "true" }, el("span", { class: "card-meter-fill", style: `width:${Math.round(f.level * 100)}%` })),
          el("span", { class: "card-word" }, f.word),
          el("span", { class: "card-num" }, f.value.toFixed(2))
        )
      )
    );
  }
  const close = el("button", { class: "card-close", type: "button", "aria-label": "Close", onclick: onClose }, "×");
  return el(
    "section",
    { class: "pigment-card", role: "dialog", "aria-label": `${pigment.name}, pigment details` },
    el(
      "header",
      { class: "card-head" },
      el("div", {}, el("h3", { class: "card-name" }, pigment.name), el("p", { class: "card-code" }, `${pigment.code} · ${handlingNote(pigment)}`)),
      close
    ),
    el("div", { class: "card-ramp" }, ramp, el("div", { class: "card-ramp-ends" }, el("span", {}, "masstone"), el("span", {}, "tint"))),
    facts,
    el("p", { class: "card-note" }, handlingSentence(pigment))
  );
}

export interface PaletteHandle {
  root: HTMLElement;
  selected(): Pigment;
  onChange(fn: (p: Pigment) => void): void;
}

export function createPalette(initialId: string): PaletteHandle {
  let current = PIGMENTS.find((p) => p.id === initialId) ?? PIGMENTS[0];
  const listeners: Array<(p: Pigment) => void> = [];

  const caption = el("div", { class: "pigment-caption" });
  const updateCaption = () => {
    caption.replaceChildren(
      el("span", { class: "pigment-name" }, current.name),
      el("span", { class: "pigment-meta" }, `${current.code} · ${handlingNote(current)}`)
    );
  };

  const buttons = new Map<string, HTMLButtonElement>();
  const grid = el("div", { class: "palette-grid", role: "listbox", "aria-label": "Pigments" });
  const root = el("div", { class: "palette" });

  // ---- the detail card ----------------------------------------------------
  let card: HTMLElement | null = null;
  let cardFor: HTMLButtonElement | null = null;
  const closeCard = () => {
    if (!card) return;
    card.remove();
    card = null;
    document.removeEventListener("pointerdown", onOutside, true);
    document.removeEventListener("keydown", onKey, true);
    cardFor?.focus();
    cardFor = null;
  };
  const onOutside = (e: PointerEvent) => {
    if (card && !card.contains(e.target as Node)) closeCard();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeCard();
    }
  };
  const openCard = (pigment: Pigment, from: HTMLButtonElement) => {
    closeCard();
    card = pigmentCard(pigment, closeCard);
    cardFor = from;
    root.append(card);
    (card.querySelector(".card-close") as HTMLButtonElement).focus();
    // Registered after this event has finished bubbling, so the press that
    // opened the card cannot also close it.
    setTimeout(() => {
      document.addEventListener("pointerdown", onOutside, true);
      document.addEventListener("keydown", onKey, true);
    }, 0);
  };

  for (const pigment of PIGMENTS) {
    const canvas = el("canvas", { width: CHIP, height: CHIP, class: "chip-swatch" });
    paintChip(canvas, pigment);
    let holdTimer = 0;
    let held = false;
    const select = () => {
      current = pigment;
      for (const [id, b] of buttons) b.setAttribute("aria-selected", String(id === pigment.id));
      updateCaption();
      for (const fn of listeners) fn(pigment);
    };
    const btn = el(
      "button",
      {
        class: "chip",
        type: "button",
        role: "option",
        title: `${pigment.name}: ${pigment.code} · ${handlingNote(pigment)}. Hold for details.`,
        "aria-label": pigment.name,
        "aria-selected": pigment.id === current.id,
        // A press that was held is a question, not a choice: the click that
        // follows the release is swallowed and the pan is not selected.
        onclick: (e: Event) => {
          if (held) {
            held = false;
            e.preventDefault();
            return;
          }
          closeCard();
          select();
        },
        onpointerdown: (e: Event) => {
          if ((e as PointerEvent).button !== 0) return;
          held = false;
          window.clearTimeout(holdTimer);
          holdTimer = window.setTimeout(() => {
            held = true;
            openCard(pigment, btn);
          }, HOLD_MS);
        },
        onpointerup: () => window.clearTimeout(holdTimer),
        onpointerleave: () => window.clearTimeout(holdTimer),
        onpointercancel: () => window.clearTimeout(holdTimer),
        oncontextmenu: (e: Event) => {
          e.preventDefault();
          window.clearTimeout(holdTimer);
          openCard(pigment, btn);
        },
      },
      canvas
    );
    buttons.set(pigment.id, btn);
    grid.append(btn);
  }
  updateCaption();
  root.append(grid, caption, el("p", { class: "palette-hint" }, "Hold a pan for its card."));

  return {
    root,
    selected: () => current,
    onChange: (fn) => listeners.push(fn),
  };
}
