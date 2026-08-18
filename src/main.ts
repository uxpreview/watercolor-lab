import "./tokens.css";
import "./styles.css";
import { appBar } from "./ui/chrome";
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

const root = document.getElementById("app")!;

root.append(
  appBar(),
  el(
    "header",
    { class: "container intro" },
    el("h1", {}, "Watercolor Lab"),
    el(
      "p",
      { class: "lede" },
      "Real watercolor, simulated: water flows, pigment settles, paper matters. ",
      "Fluid dynamics after Curtis et al. (SIGGRAPH 1997), Kubelka-Munk pigment optics, and a box of ",
      "36 real pigments. Wet washes bleed, edges darken as they dry, ultramarine granulates into the ",
      "tooth of the sheet — all live, on your GPU."
    )
  )
);

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

root.append(
  el(
    "footer",
    { class: "container studio-footer" },
    el(
      "p",
      { class: "footnote" },
      "Wet the sheet first for soft blooms; paint onto dry paper for hard edges. Sprinkle salt into a ",
      "damp wash and let it dry. Backlight shows what the light survives. EXP-041 · ",
      el("a", { href: "https://github.com/uxpreview/miniature-spork" }, "source"),
      " · after ",
      el(
        "a",
        { href: "https://grail.cs.washington.edu/projects/watercolor/" },
        "Curtis, Anderson, Seims, Fleischer & Salesin (1997)"
      )
    )
  )
);
