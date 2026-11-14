import "./tokens.css";
import "./styles.css";
import { appBar, LAB_URL } from "./ui/chrome";
import { mountStudio, type AppApi } from "./ui/app";
import { el } from "./ui/dom";

declare global {
  interface Window {
    /** The scripted driver: everything the pointer can do, callable. Used by
     * the figures script and the visual checks; left on in production
     * because a console-driven brush is a feature, not a leak. */
    __wash?: AppApi;
  }
}

// --- The experiment page shell -------------------------------------------
// This tool is EXP-040 in the Lab on ryankm.com and it is hosted here rather
// than there, so the page has to do the work the site's /lab/<slug> route
// normally does: the trail back up, the record voice (number, kind, state,
// then the stack), the claim in display type, and the lede. Same order, same
// tokens, same measure as the other off-site experiments (see Attention Lab).

function experimentHead(): HTMLElement {
  return el(
    "header",
    { class: "app-header" },
    appBar(),
    el(
      "div",
      { class: "container exp-head" },
      el("h1", { class: "t-h1" }, "Watercolor Lab"),
      // Two sentences. The physics gets its say in the bench notes below the
      // sheet, not above it.
      el(
        "p",
        { class: "t-lede" },
        "Real watercolor, simulated: water flows across the sheet, pigment rides it and settles, and the paper decides the rest. Thirty-six real pigments, wet-on-wet blooms, granulation, backruns and salt, all live on your GPU."
      ),
      recordFacts("exp-facts-head")
    )
  );
}

/**
 * The record: what kind of thing this is, its state, and what it is made with.
 * On the site this is the facts table in the right rail of every /lab/<slug>
 * page; the experiment number stays in the site's data and off the page. It
 * is drawn twice here and shown once: beside the title from a laptop up
 * (`exp-facts-head`), and above the notes on anything narrower
 * (`exp-facts-foot`). The hidden copy is `display: none`, so a screen reader
 * meets one.
 */
function recordFacts(placement: string): HTMLElement {
  const row = (k: string, ...v: Array<string | HTMLElement>): HTMLElement =>
    el("div", {}, el("dt", {}, k), el("dd", {}, ...v));
  return el(
    "dl",
    { class: `facts facts-end exp-facts ${placement}` },
    row("Kind", "Tool"),
    row("Status", el("span", { class: "exp-state" }, el("span", { class: "status-dot", "aria-hidden": "true" }), "Live")),
    row("Made with", "WebGL2 · Kubelka-Munk optics · 36 real pigments")
  );
}

// Bench notes, in the site's ledger voice: a label rail on the left and the
// note beside it. What a painter needs to know that the studio cannot say.
// Focus is a desk feature (on a phone the sheet already leads the page at
// full width), so its sentence only appears where the button does.
const BENCH_NOTES: { k: string; v: (string | HTMLElement)[] }[] = [
  {
    k: "Wet the sheet first",
    v: [
      "Water before paint gives soft blooms; paint onto dry paper for hard edges. Sprinkle salt into a damp wash and let it dry. Backlight shows what the light survives." +
        (window.matchMedia("(max-width: 720px)").matches
          ? ""
          : " Focus (the button on the desk, or F) gives you the sheet alone, as big as the window."),
    ],
  },
  {
    k: "Dried paint is cured",
    v: [
      "Once a wash dries it is part of the sheet: glaze over it, but you cannot lift it. The lift tool works on damp washes, and Forever wet keeps the sheet workable for as long as you like.",
    ],
  },
  {
    k: "The color is physics",
    v: [
      "Every swatch and every wash is Kubelka-Munk optics from the absorption and scattering of a real pigment, not alpha blending. Mixing on the sheet and mixing in the well are the same arithmetic.",
    ],
  },
  {
    k: "It stays on this machine",
    v: [
      "There is no server and no analytics. A saved sheet lives in this browser's own storage, which is also why clearing site data deletes it.",
    ],
  },
  {
    k: "Where it comes from",
    v: [
      "The fluid model is ",
      el(
        "a",
        { href: "https://grail.cs.washington.edu/projects/watercolor/" },
        "Curtis, Anderson, Seims, Fleischer & Salesin, Computer-Generated Watercolor (SIGGRAPH 1997)"
      ),
      ", as WebGL2 fragment shaders. The ",
      el("a", { href: "https://github.com/uxpreview/watercolor-lab" }, "source"),
      " is on GitHub.",
    ],
  },
];

function footer(): HTMLElement {
  const notes = el("dl", { class: "notes" });
  BENCH_NOTES.forEach((note, i) => {
    notes.append(
      el(
        "div",
        { class: "note-row" },
        el(
          "dt",
          {},
          el("span", { class: "num", "aria-hidden": "true" }, String(i + 1).padStart(2, "0")),
          el("span", { class: "t-card" }, note.k)
        ),
        el("dd", {}, ...note.v)
      )
    );
  });
  return el(
    "footer",
    { class: "app-footer" },
    el(
      "div",
      { class: "container" },
      recordFacts("exp-facts-foot"),
      el("div", { class: "shelf" }, el("h2", { class: "eyebrow" }, "Notes")),
      notes,
      el(
        "p",
        { class: "footer-credit" },
        el("a", { class: "btn btn-small", href: LAB_URL }, "More in the Lab at ryankm.com", el("span", { "aria-hidden": "true" }, "→"))
      )
    )
  );
}

const root = document.getElementById("app")!;

// On a phone the sheet leads: the first thing on the page is the paper, the
// way every phone painting tool opens, and the masthead becomes the colophon
// between the studio and the bench notes. A desk keeps the site's order,
// where the record voice above the fold is the point of the Lab shell.
const phoneShell = window.matchMedia("(max-width: 720px)").matches;

if (!phoneShell) root.append(experimentHead());

try {
  window.__wash = mountStudio(root);
} catch (err) {
  root.append(
    el(
      "div",
      { class: "container gl-error" },
      el("h2", {}, "This browser can't run the simulation"),
      el("p", {}, `The simulator needs WebGL2 with float render targets. (${err instanceof Error ? err.message : String(err)})`)
    )
  );
}

if (phoneShell) root.append(experimentHead());
root.append(footer());
