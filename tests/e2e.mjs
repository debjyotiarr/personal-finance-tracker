// End-to-end check of the main flows in a real browser.
// Run: npm start (in another terminal), then: node tests/e2e.mjs
// Simulates two devices (separate browser profiles) syncing through a file.

import { createRequire } from "node:module";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");
const BASE = process.env.BASE || "http://127.0.0.1:5173/";
const dir = await mkdtemp(path.join(tmpdir(), "ft-e2e-"));
const errors = [];
const step = (msg) => console.log(`✓ ${msg}`);

const browser = await chromium.launch();
async function device(name, opts) {
  const ctx = await browser.newContext({ ...opts, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${name}: ${m.text()}`); });
  await page.goto(BASE);
  await page.waitForSelector("#app:not([hidden])");
  return { ctx, page };
}
const count = (page) => page.evaluate(async () => (await import("./js/store.js")).store.transactions.length);

async function addExpense(page, { amount, cat, note }) {
  await page.evaluate(async () => (await import("./js/ui/entry.js")).openEntry());
  await page.fill("[name=amount]", amount);
  await page.click(`[data-cat=${cat}]`);
  await page.fill("[name=note]", note);
  await page.click(".sheet-foot [type=submit]");
}

// Device A: "iPhone"
const a = await device("iphone", { ...devices["iPhone 13"] });
await addExpense(a.page, { amount: "200+50", cat: "cat-food", note: "Swiggy" });
await a.page.waitForTimeout(300);
assert.equal(await count(a.page), 1);
const saved = await a.page.evaluate(async () => (await import("./js/store.js")).store.transactions[0]);
assert.equal(saved.amount, 250, "expression evaluated");
step("add expense with 200+50 = 250");

await addExpense(a.page, { amount: "255", cat: "cat-food", note: "Swiggy again" });
await a.page.waitForSelector(".callout-warn[role=alert]");
assert.equal(await a.page.textContent(".sheet-foot [type=submit]"), "Save anyway");
await a.page.click(".sheet-foot [type=submit]");
await a.page.waitForTimeout(300);
assert.equal(await count(a.page), 2);
step("near-duplicate warning, then save anyway");

await a.page.evaluate(async () => (await import("./js/ui/entry.js")).openEntry());
await a.page.fill("[name=amount]", "42000");
await a.page.click("[data-cat=cat-bills]");
await a.page.fill("[name=note]", "Rent");
await a.page.click(".pill-date"); // focus only
await a.page.fill("[name=date]", "2026-08-01");
await a.page.selectOption("[name=repeat]", "monthly");
await a.page.click(".sheet-foot [type=submit]");
await a.page.waitForTimeout(400);
const rents = await a.page.evaluate(async () => (await import("./js/store.js")).store.transactions.filter((t) => t.note === "Rent").map((t) => t.date).sort());
assert.ok(rents.length >= 4 && rents[0] === "2026-08-01", `monthly rent back-filled: ${rents}`);
step(`repeating rent created ${rents.length} entries from 1 Aug`);

// Delete with undo.
await a.page.evaluate(() => { location.hash = "#/activity?month=all"; });
await a.page.waitForTimeout(200);
const before = await count(a.page);
await a.page.click(".txn >> nth=0");
await a.page.click("[data-delete]");
await a.page.waitForTimeout(250);
assert.equal(await count(a.page), before - 1);
await a.page.click(".toast button");
await a.page.waitForTimeout(250);
assert.equal(await count(a.page), before);
step("delete and undo");

// A saves its sync file (desktop fallback = download; on iPhone it would be the share sheet).
await a.page.evaluate(() => { navigator.canShare = undefined; location.hash = "#/settings/sync"; });
await a.page.waitForSelector("[data-save]");
const [dlA] = await Promise.all([a.page.waitForEvent("download"), a.page.click("[data-save]")]);
const fileA = path.join(dir, "from-iphone.json");
await dlA.saveAs(fileA);
step("iPhone saved sync file");

// Device B: "Mac" starts fresh, adds its own entry, then merges A's file.
const b = await device("mac", { viewport: { width: 1280, height: 800 } });
await addExpense(b.page, { amount: "1200", cat: "cat-groceries", note: "Big basket" });
await b.page.waitForTimeout(300);
await b.page.evaluate(() => { location.hash = "#/settings/sync"; });
await b.page.waitForSelector("[data-merge]", { state: "attached" });
await b.page.setInputFiles("[data-merge]", fileA);
await b.page.waitForTimeout(500);
const bCount = await count(b.page);
assert.equal(bCount, before + 1, "Mac has iPhone's entries plus its own");
const cats = await b.page.evaluate(async () => (await import("./js/store.js")).store.categories.length);
assert.equal(cats, 16, "seed categories not duplicated");
step(`Mac merged iPhone's file: ${bCount} entries, no duplicate categories`);

// B edits one of A's entries, deletes another, and saves.
await b.page.evaluate(async () => {
  const { store } = await import("./js/store.js");
  const swiggy = store.transactions.find((t) => t.note === "Swiggy");
  await store.save("transactions", { ...swiggy, amount: 275 });
  const again = store.transactions.find((t) => t.note === "Swiggy again");
  await store.remove("transactions", again.id);
});
const [dlB] = await Promise.all([b.page.waitForEvent("download"), b.page.click("[data-save]")]);
const fileB = path.join(dir, "from-mac.json");
await dlB.saveAs(fileB);

// A merges B's file: gets the edit, the delete, and B's new entry.
await a.page.reload();
await a.page.waitForSelector("[data-merge]", { state: "attached" });
await a.page.setInputFiles("[data-merge]", fileB);
await a.page.waitForTimeout(500);
const aState = await a.page.evaluate(async () => {
  const { store } = await import("./js/store.js");
  return {
    swiggy: store.transactions.find((t) => t.note === "Swiggy")?.amount,
    again: store.transactions.some((t) => t.note === "Swiggy again"),
    basket: store.transactions.some((t) => t.note === "Big basket"),
    n: store.transactions.length
  };
});
assert.deepEqual([aState.swiggy, aState.again, aState.basket], [275, false, true]);
assert.equal(aState.n, bCount - 1);
step("iPhone merged Mac's file: edit, delete and new entry all arrived");

// Merging the same file twice changes nothing.
await a.page.setInputFiles("[data-merge]", fileB);
await a.page.waitForTimeout(400);
assert.equal(await count(a.page), aState.n);
step("merging the same file again is a no-op");

// A file that isn't a sync file is rejected politely.
const junk = path.join(dir, "junk.json");
await writeFile(junk, '{"hello": 1}');
await a.page.setInputFiles("[data-merge]", junk);
await a.page.waitForSelector(".toast:has-text(\"doesn't look like\")");
step("foreign file rejected with a clear message");

// Currencies: add EUR and log a euro expense; it converts in Insights.
await a.page.evaluate(async () => {
  const { store } = await import("./js/store.js");
  await store.save("currencies", { id: "EUR", code: "EUR", name: "Euro", symbol: "€", toUSD: 1.1, toINR: 96 });
});
await a.page.evaluate(async () => (await import("./js/ui/entry.js")).openEntry());
await a.page.selectOption("[name=currency]", "EUR");
await a.page.fill("[name=amount]", "10");
assert.match(await a.page.textContent("[data-amount-hint]"), /₹960/);
await a.page.click("[data-cat=cat-travel]");
await a.page.click(".sheet-foot [type=submit]");
await a.page.waitForTimeout(300);
const eur = await a.page.evaluate(async () => (await import("./js/store.js")).store.transactions.find((t) => t.currency === "EUR"));
assert.deepEqual([eur.rateUSD, eur.rateINR], [1.1, 96]);
step("EUR entry stores its rate snapshot (₹960, $11)");

// PIN lock round trip.
await a.page.evaluate(() => { location.hash = "#/settings/lock"; });
await a.page.fill("[name=pin]", "2468");
await a.page.fill("[name=pin2]", "2468");
await a.page.click(".lock-form [type=submit]");
await a.page.waitForTimeout(400);
await a.page.reload();
await a.page.waitForSelector("#lock:not([hidden])");
for (const d of "1111") await a.page.click(`[data-key="${d}"]`);
await a.page.waitForSelector(".lock-error:has-text(\"Wrong\")");
for (const d of "2468") await a.page.click(`[data-key="${d}"]`);
await a.page.waitForSelector("#lock", { state: "hidden" });
step("app lock rejects a wrong passcode and accepts the right one");

await browser.close();
if (errors.length) { console.error("Console errors:\n" + errors.join("\n")); process.exit(1); }
console.log("All end-to-end checks passed.");
