// App entry: boot, routing, navigation and global shortcuts.

import { store } from "./store.js";
import { requestPersistence } from "./db.js";
import { initSheet, closeSheet, icon, toast } from "./ui/dom.js";
import { openEntry } from "./ui/entry.js";
import { renderHome } from "./ui/home.js";
import { renderActivity, setActivityFilters } from "./ui/activity.js";
import { renderInsights, setInsightsPeriod } from "./ui/insights.js";
import { renderSettings } from "./ui/settings.js";
import { isLocked, showLock, watchForRelock } from "./ui/lock.js";
import { relativeTime } from "./ui/view.js";
import { todayISO } from "./util.js";

const NAV = [
  { id: "home", label: "Home", icon: "home" },
  { id: "activity", label: "Activity", icon: "list" },
  { id: "insights", label: "Insights", icon: "chart" },
  { id: "settings", label: "Settings", icon: "gear" }
];

const main = document.getElementById("main");
let route = { page: "home", sub: "", params: new URLSearchParams() };
let lastDay = todayISO();

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const [page = "home", sub = ""] = path.split("/");
  return { page: page || "home", sub, params: new URLSearchParams(query) };
}

function renderNav() {
  const item = (n) => `
    <a href="#/${n.id}" class="nav-item" ${route.page === n.id ? 'aria-current="page"' : ""}>
      ${icon(n.icon)}<span>${n.label}</span>
    </a>`;
  document.querySelector("[data-nav]").innerHTML = NAV.map(item).join("");
  document.querySelector("[data-tabbar]").innerHTML = `
    ${NAV.slice(0, 2).map(item).join("")}
    <button type="button" class="tab-add" data-action="add" aria-label="Add transaction">${icon("plus")}</button>
    ${NAV.slice(2).map(item).join("")}`;
  const sync = store.local.lastSyncAt;
  document.querySelector("[data-sync-chip]").innerHTML = `<a href="#/settings/sync" class="side-sync">${icon("sync")}<span>${sync ? `Synced ${relativeTime(sync)}` : "Not synced yet"}</span></a>`;
}

function render() {
  renderNav();
  switch (route.page) {
    case "activity": renderActivity(main); break;
    case "insights": renderInsights(main); break;
    case "settings": renderSettings(main, route.sub); break;
    default: renderHome(main);
  }
}

function onRoute({ initial = false } = {}) {
  const next = parseHash();
  if (next.page === "add") {
    history.replaceState(null, "", "#/home");
    route = { page: "home", sub: "", params: new URLSearchParams() };
    render();
    openEntry();
    return;
  }
  const changedPage = next.page !== route.page || next.sub !== route.sub;
  if (next.page === "activity") setActivityFilters(next.params);
  if (next.page === "insights") setInsightsPeriod(next.params);
  route = next;
  if (!initial) closeSheet();
  render();
  if (changedPage) window.scrollTo(0, 0);
}

function wireGlobal() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    if (btn.dataset.action === "add") openEntry();
  });
  main.addEventListener("click", (e) => {
    const txn = e.target.closest("[data-txn]");
    if (txn) openEntry({ id: txn.dataset.txn });
  });

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.getElementById("sheet").open;
    if (typing || !document.getElementById("lock").hidden) return;
    if (e.key === "n" || e.key === "N" || e.key === "+") { e.preventDefault(); openEntry(); }
    else if (e.key === "/") { e.preventDefault(); location.hash = "#/activity"; setTimeout(() => main.querySelector("[name=q]")?.focus(), 30); }
    else if (/^[1-4]$/.test(e.key)) location.hash = `#/${NAV[Number(e.key) - 1].id}`;
  });

  window.addEventListener("hashchange", () => onRoute());

  // Re-render when data changes, without interrupting an open sheet.
  let queued = false;
  store.subscribe(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(); });
  });

  // When the app comes back to the foreground on a new day, create any
  // repeating entries that are now due.
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) return;
    if (todayISO() !== lastDay) {
      lastDay = todayISO();
      const n = await store.generateRecurring();
      if (n) toast(`${n} repeating entr${n === 1 ? "y" : "ies"} added`);
      render();
    }
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  navigator.serviceWorker.register("sw.js").then((reg) => {
    reg.addEventListener("updatefound", () => {
      const worker = reg.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          toast("A new version is ready", { action: "Reload", onAction: () => { worker.postMessage("skip-waiting"); location.reload(); }, timeout: 8000 });
        }
      });
    });
  }).catch(() => {});
}

async function boot() {
  try {
    await store.init();
  } catch (error) {
    document.getElementById("boot").innerHTML = `<p class="boot-error">Couldn't open storage on this device: ${error.message}. If you're in a private window, open the app in a normal one.</p>`;
    return;
  }
  initSheet();
  wireGlobal();
  if (isLocked()) await showLock();
  watchForRelock(() => { closeSheet(); showLock(); });
  document.getElementById("boot").remove();
  document.getElementById("app").hidden = false;
  onRoute({ initial: true });
  registerServiceWorker();
  requestPersistence();
}

boot();
