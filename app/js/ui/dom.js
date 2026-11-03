// DOM helpers: sheet (modal), toasts, confirm, icons.

import { escapeHtml } from "../util.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const sheet = () => document.getElementById("sheet");
let sheetCleanup = null;

/** Opens the modal sheet. `render(el)` fills it; returns a close function. */
export function openSheet(render, { onClose, wide = false } = {}) {
  const el = sheet();
  if (el.open) closeSheet();
  el.classList.toggle("sheet-wide", wide);
  el.innerHTML = "";
  sheetCleanup = onClose || null;
  render(el);
  el.showModal();
  el.scrollTop = 0;
  return closeSheet;
}

export function closeSheet() {
  const el = sheet();
  if (!el.open) return;
  el.classList.add("is-closing");
  const finish = () => {
    el.classList.remove("is-closing");
    el.close();
    el.innerHTML = "";
    const fn = sheetCleanup;
    sheetCleanup = null;
    fn?.();
  };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) finish();
  else setTimeout(finish, 160);
}

export function initSheet() {
  const el = sheet();
  el.addEventListener("click", (event) => {
    if (event.target === el) closeSheet(); // tap on the backdrop
  });
  el.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeSheet();
  });
}

export function toast(message, { action, onAction, timeout = 3200 } = {}) {
  const zone = document.getElementById("toasts");
  // One toast at a time, so an Undo button always refers to the latest action.
  zone.querySelectorAll(".toast").forEach((old) => old.remove());
  const node = document.createElement("div");
  node.className = "toast";
  node.innerHTML = `<span>${escapeHtml(message)}</span>${action ? `<button type="button">${escapeHtml(action)}</button>` : ""}`;
  zone.appendChild(node);
  const remove = () => {
    node.classList.add("is-leaving");
    setTimeout(() => node.remove(), 200);
  };
  node.querySelector("button")?.addEventListener("click", () => {
    onAction?.();
    remove();
  });
  setTimeout(remove, action ? timeout + 2500 : timeout);
}

/** A promise-based confirm using the sheet. */
export function confirmSheet({ title, body = "", confirm = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    openSheet((el) => {
      el.innerHTML = `
        <div class="sheet-body confirm">
          <h2 id="sheet-title">${escapeHtml(title)}</h2>
          ${body ? `<p class="muted">${escapeHtml(body)}</p>` : ""}
          <div class="row-end">
            <button type="button" class="btn btn-quiet" data-no>Cancel</button>
            <button type="button" class="btn ${danger ? "btn-danger" : "btn-primary"}" data-yes>${escapeHtml(confirm)}</button>
          </div>
        </div>`;
      el.querySelector("[data-yes]").addEventListener("click", () => { answered = true; resolve(true); closeSheet(); });
      el.querySelector("[data-no]").addEventListener("click", () => closeSheet());
    }, { onClose: () => { if (!answered) resolve(false); } });
  });
}

const ICONS = {
  home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".6"/><circle cx="4" cy="12" r=".6"/><circle cx="4" cy="18" r=".6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  repeat: '<path d="M17 2l3 3-3 3M3 11V9a4 4 0 0 1 4-4h13M7 22l-3-3 3-3M21 13v2a4 4 0 0 1-4 4H4"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
};

export function icon(name, cls = "icon") {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}
