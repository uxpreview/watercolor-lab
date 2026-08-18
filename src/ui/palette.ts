/**
 * The pigment palette. Every chip is painted by the same Kubelka-Munk maths
 * the simulator renders with — a thickness ramp of the pigment over the
 * sheet's own reflectance — so the chip is an honest preview of the wash, not
 * a hex swatch that the physics then disagrees with.
 */

import { composite, layerRT, linearToSrgbByte, PAPER_REFLECTANCE, type Vec3 } from "../paint/km";
import { handlingNote, PIGMENTS, type Pigment } from "../paint/pigments";
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
  for (const pigment of PIGMENTS) {
    const canvas = el("canvas", { width: CHIP, height: CHIP, class: "chip-swatch" });
    paintChip(canvas, pigment);
    const btn = el(
      "button",
      {
        class: "chip",
        type: "button",
        role: "option",
        title: `${pigment.name} — ${pigment.code} · ${handlingNote(pigment)}`,
        "aria-label": pigment.name,
        "aria-selected": pigment.id === current.id,
        onclick: () => {
          current = pigment;
          for (const [id, b] of buttons) b.setAttribute("aria-selected", String(id === pigment.id));
          updateCaption();
          for (const fn of listeners) fn(pigment);
        },
      },
      canvas
    );
    buttons.set(pigment.id, btn);
    grid.append(btn);
  }
  updateCaption();

  return {
    root: el("div", { class: "palette" }, grid, caption),
    selected: () => current,
    onChange: (fn) => listeners.push(fn),
  };
}
