import { el } from "./dom";

/**
 * The site chrome. This tool is part of the Lab on ryankm.com and is hosted
 * off-site, so the bar is the only thing carrying the brand and the only
 * route home — same shape as every other experiment served from its own
 * subdomain. The wordmark is the site's: the full name, set in tracked
 * capitals by the stylesheet (the text stays "Ryan McCarty" for a screen
 * reader), and the way back is one of the header's pills.
 */

export const SITE_URL = "https://ryankm.com";
export const LAB_URL = `${SITE_URL}/lab`;

export function appBar(): HTMLElement {
  return el(
    "div",
    { class: "site-bar" },
    el(
      "div",
      { class: "container bar-inner" },
      el("a", { class: "wordmark", href: SITE_URL, "aria-label": "Ryan McCarty, ryankm.com" }, "Ryan McCarty"),
      el(
        "a",
        { class: "bar-back", href: LAB_URL },
        "Back to the Lab",
        el("span", { "aria-hidden": "true" }, "↗")
      )
    )
  );
}
