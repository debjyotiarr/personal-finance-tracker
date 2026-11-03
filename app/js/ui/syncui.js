// Sync & backup screen.

import { store } from "../store.js";
import { buildSyncFile, parseSyncFile, countChangesSince } from "../sync.js";
import { escapeHtml } from "../util.js";
import { toast, icon } from "./dom.js";
import { relativeTime } from "./view.js";
import { downloadBlob } from "./activity.js";

const FILE_NAME = "finance-sync.json";
const canLink = typeof window !== "undefined" && "showOpenFilePicker" in window;

function syncText() {
  return buildSyncFile(store.data, { deviceId: store.local.deviceId, deviceName: store.local.deviceName });
}

function describeCounts(counts) {
  const n = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!n) return "Already up to date";
  const tx = counts.transactions || 0;
  const other = n - tx;
  const parts = [];
  if (tx) parts.push(`${tx} transaction${tx > 1 ? "s" : ""}`);
  if (other) parts.push(`${other} other change${other > 1 ? "s" : ""}`);
  return `Brought in ${parts.join(" and ")}`;
}

async function mergeText(text, label) {
  const { data, meta } = parseSyncFile(text);
  const counts = await store.mergeIn(data);
  await store.setLocal("lastSyncFile", { name: label, from: meta.deviceName, at: Date.now() });
  return counts;
}

export function renderSync(main) {
  const changes = countChangesSince(store.data, store.local.lastSyncAt || 0);
  const handle = store.local.syncHandle;
  const isiPhone = /iPhone|iPad/.test(navigator.userAgent);
  const last = store.local.lastSyncFile;

  main.innerHTML = `
    <header class="page-head">
      <div><a class="back" href="#/settings">${icon("back")} Settings</a><h1>Sync & backup</h1></div>
    </header>

    <section class="sync-status">
      <p class="sync-big">${store.local.lastSyncAt ? `Last saved ${escapeHtml(relativeTime(store.local.lastSyncAt))}` : "Not synced yet"}</p>
      <p class="muted">${changes ? `${changes} change${changes > 1 ? "s" : ""} on this ${escapeHtml(store.local.deviceName || "device")} since then.` : "Nothing new on this device since then."}
      ${last?.from ? ` Last merged a file from ${escapeHtml(last.from)}, ${escapeHtml(relativeTime(last.at))}.` : ""}</p>
    </section>

    ${canLink ? `
      <section class="block">
        <h2 class="block-title">One-click sync</h2>
        <div class="group pad-group">
          ${handle ? `
            <p>Linked to <strong>${escapeHtml(handle.name)}</strong>. Sync reads it, merges in changes from your other devices, and writes everything back.</p>
            <div class="row-end">
              <button type="button" class="btn btn-quiet" data-unlink>Unlink</button>
              <button type="button" class="btn btn-primary" data-sync-now>${icon("sync")} Sync now</button>
            </div>` : `
            <p>Link one file in your iCloud Drive or Google Drive folder, then sync with one click from now on.</p>
            <div class="row-end">
              <button type="button" class="btn btn-quiet" data-link-new>Create a new file</button>
              <button type="button" class="btn btn-primary" data-link>Choose existing file</button>
            </div>`}
        </div>
      </section>` : ""}

    <section class="block">
      <h2 class="block-title">${canLink ? "Or sync by hand" : "Sync"}</h2>
      <ol class="steps">
        <li>
          <div><p class="step-title">Merge in the latest file</p>
          <p class="muted">Pick <code>${FILE_NAME}</code> from iCloud Drive or Google Drive. You can pick several; merging is always safe.</p></div>
          <label class="btn btn-quiet">Choose file…<input type="file" accept=".json,application/json" multiple data-merge hidden /></label>
        </li>
        <li>
          <div><p class="step-title">Save the updated file</p>
          <p class="muted">${isiPhone ? "Choose “Save to Files”, pick the same folder, and tap Replace." : "Save it to the same folder, replacing the old copy."}</p></div>
          <button type="button" class="btn btn-primary" data-save>Save file</button>
        </li>
      </ol>
      <p class="group-note">Do this on one device, then the other. Each entry keeps its latest edit, and deletions carry across too.</p>
    </section>

    <section class="block">
      <h2 class="block-title">How to set it up</h2>
      <div class="prose prose-tight">
        <p><strong>iCloud Drive:</strong> make a folder called <em>Finances</em> in iCloud Drive. On iPhone it's in the Files app; on Mac it's in Finder's sidebar.</p>
        <p><strong>Google Drive:</strong> on iPhone, turn on Google Drive under Files › Browse › ⋯ › Edit. On Mac, install Google Drive for desktop and use a folder inside it.</p>
        <p>The sync file is also a full backup. Keep an extra copy now and then if you like.</p>
      </div>
    </section>
  `;

  main.querySelector("[data-merge]").addEventListener("change", async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    let total = {};
    try {
      for (const file of files) {
        const counts = await mergeText(await file.text(), file.name);
        for (const [k, v] of Object.entries(counts)) total[k] = (total[k] || 0) + v;
      }
      toast(`${describeCounts(total)}. Now save the updated file.`);
    } catch (error) {
      toast(error.message);
    }
    renderSync(main);
  });

  main.querySelector("[data-save]").addEventListener("click", async () => {
    const blob = new Blob([syncText()], { type: "application/json" });
    const done = await downloadBlob(blob, FILE_NAME);
    if (done) {
      await store.setLocal("lastSyncAt", Date.now());
      toast("Sync file saved");
      renderSync(main);
    }
  });

  main.querySelector("[data-link]")?.addEventListener("click", async () => {
    try {
      const [h] = await window.showOpenFilePicker({ types: [{ description: "Sync file", accept: { "application/json": [".json"] } }] });
      await store.setLocal("syncHandle", h);
      await syncWithHandle(h);
    } catch (error) {
      if (error.name !== "AbortError") toast(error.message);
    }
    renderSync(main);
  });

  main.querySelector("[data-link-new]")?.addEventListener("click", async () => {
    try {
      const h = await window.showSaveFilePicker({ suggestedName: FILE_NAME, types: [{ description: "Sync file", accept: { "application/json": [".json"] } }] });
      await store.setLocal("syncHandle", h);
      await syncWithHandle(h);
    } catch (error) {
      if (error.name !== "AbortError") toast(error.message);
    }
    renderSync(main);
  });

  main.querySelector("[data-sync-now]")?.addEventListener("click", async () => {
    try {
      await syncWithHandle(handle);
    } catch (error) {
      toast(error.message || "Couldn't reach the sync file. Choose it again.");
    }
    renderSync(main);
  });

  main.querySelector("[data-unlink]")?.addEventListener("click", async () => {
    await store.setLocal("syncHandle", null);
    renderSync(main);
  });
}

async function syncWithHandle(handle) {
  const opts = { mode: "readwrite" };
  if ((await handle.queryPermission?.(opts)) !== "granted" && (await handle.requestPermission?.(opts)) !== "granted") {
    throw new Error("Allow access to the sync file to continue.");
  }
  const file = await handle.getFile();
  let counts = {};
  if (file.size > 0) counts = await mergeText(await file.text(), handle.name);
  const writable = await handle.createWritable();
  await writable.write(syncText());
  await writable.close();
  await store.setLocal("lastSyncAt", Date.now());
  toast(`${describeCounts(counts)}. File updated.`);
}
