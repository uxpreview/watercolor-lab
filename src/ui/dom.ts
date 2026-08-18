/** Minimal DOM helpers, shared voice with the other Lab experiments. The app
 * is one screen of controls around a canvas; a framework would mostly get in
 * the way of the part that matters. */

type Child = Node | string | null | undefined | false;

type AttrValue = string | number | boolean | null | undefined;

export type Attrs = Record<string, AttrValue | EventListener>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;

    if (typeof value === "function") {
      // Listener-ness is decided by the key, never inferred from the value's
      // runtime type — an inferred listener is a failure with nothing to see.
      if (!key.startsWith("on")) {
        throw new TypeError(`el(): "${key}" was given a function; event keys must start with "on"`);
      }
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === "class") {
      node.className = String(value);
    } else if (value === true) {
      node.setAttribute(key, "");
    } else {
      node.setAttribute(key, String(value));
    }
  }

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }

  return node;
}

/**
 * A two-step destructive button, same rationale as everywhere else in the
 * Lab: clearing the sheet has no undo past the snapshot ring, so it should
 * not fire on a single click, and a native confirm() would break the page's
 * voice to ask. Both labels are always in the button, stacked in one grid
 * cell, so arming cannot reflow the toolbar.
 */
export function confirmButton(
  label: string,
  armedLabel: string,
  onConfirm: () => void,
  className = "btn btn-ghost"
): HTMLButtonElement {
  const btn = el(
    "button",
    { class: `${className} confirm-btn`, type: "button" },
    el("span", { class: "confirm-rest" }, label),
    el("span", { class: "confirm-armed" }, armedLabel)
  );
  let disarm = 0;
  btn.addEventListener("click", () => {
    if (btn.classList.contains("is-armed")) {
      window.clearTimeout(disarm);
      btn.classList.remove("is-armed");
      onConfirm();
      return;
    }
    btn.classList.add("is-armed");
    disarm = window.setTimeout(() => btn.classList.remove("is-armed"), 3000);
  });
  return btn;
}
