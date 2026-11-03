// In-memory app state backed by IndexedDB. The full data set is small enough
// (years of personal transactions) to keep in memory, which keeps every
// screen instant and the analysis code simple.

import * as db from "./db.js";
import { seedData } from "./defaults.js";
import { mergeAll, COLLECTIONS } from "./sync.js";
import { dueTransactions } from "./recurring.js";
import { todayISO, uid } from "./util.js";

const listeners = new Set();

export const store = {
  data: Object.fromEntries(COLLECTIONS.map((c) => [c, []])),
  local: {},

  async init() {
    for (const name of COLLECTIONS) this.data[name] = await db.getAll(name);
    if (!this.data.prefs.length && !this.data.categories.length) {
      const seed = seedData();
      for (const name of COLLECTIONS) {
        this.data[name] = seed[name];
        await db.putMany(name, seed[name]);
      }
    }
    for (const key of ["deviceId", "deviceName", "lastSyncAt", "lastSyncFile", "pinHash", "pinSalt", "lastAccountId", "lastCurrency", "syncHandle", "installHintDismissed"]) {
      this.local[key] = await db.getLocal(key);
    }
    if (!this.local.deviceId) await this.setLocal("deviceId", uid("dev"));
    if (!this.local.deviceName) await this.setLocal("deviceName", guessDeviceName());
    await this.generateRecurring();
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  emit() {
    for (const fn of listeners) fn();
  },

  // --- reads (active records only) ---
  active(name) {
    return this.data[name].filter((r) => !r.deleted);
  },
  get transactions() { return this.active("transactions"); },
  get categories() { return this.active("categories").sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name)); },
  get accounts() { return this.active("accounts").sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name)); },
  get currencies() {
    return this.active("currencies").sort((a, b) => {
      const rank = (c) => (c.code === "INR" ? 0 : c.code === "USD" ? 1 : 2);
      return rank(a) - rank(b) || a.code.localeCompare(b.code);
    });
  },
  get recurring() { return this.active("recurring"); },
  get prefs() { return this.active("prefs")[0] || seedData().prefs[0]; },
  get currenciesByCode() { return new Map(this.currencies.map((c) => [c.code, c])); },
  find(name, id) { return this.data[name].find((r) => r.id === id && !r.deleted) || null; },

  // --- writes ---
  async save(name, record) {
    const now = Date.now();
    const index = this.data[name].findIndex((r) => r.id === record.id);
    const prev = index >= 0 ? this.data[name][index] : null;
    const next = {
      ...record,
      id: record.id || uid(name.slice(0, 3)),
      createdAt: prev?.createdAt || record.createdAt || now,
      updatedAt: Math.max(now, (prev?.updatedAt || 0) + 1)
    };
    delete next.deleted;
    if (index >= 0) this.data[name][index] = next; else this.data[name].push(next);
    await db.putMany(name, [next]);
    this.emit();
    return next;
  },

  async saveMany(name, records) {
    const saved = [];
    for (const r of records) {
      const now = Date.now();
      const index = this.data[name].findIndex((x) => x.id === r.id);
      const prev = index >= 0 ? this.data[name][index] : null;
      const next = { ...r, id: r.id || uid(name.slice(0, 3)), createdAt: prev?.createdAt || r.createdAt || now, updatedAt: Math.max(now, (prev?.updatedAt || 0) + 1) };
      delete next.deleted;
      if (index >= 0) this.data[name][index] = next; else this.data[name].push(next);
      saved.push(next);
    }
    await db.putMany(name, saved);
    this.emit();
    return saved;
  },

  async remove(name, id) {
    const index = this.data[name].findIndex((r) => r.id === id);
    if (index < 0) return;
    const prev = this.data[name][index];
    const tombstone = { id, deleted: true, createdAt: prev.createdAt || 0, updatedAt: Math.max(Date.now(), (prev.updatedAt || 0) + 1) };
    this.data[name][index] = tombstone;
    await db.putMany(name, [tombstone]);
    this.emit();
  },

  async savePrefs(patch) {
    return this.save("prefs", { ...this.prefs, ...patch, id: "prefs" });
  },

  async setLocal(key, value) {
    this.local[key] = value;
    await db.setLocal(key, value);
  },

  // --- recurring ---
  async generateRecurring() {
    const existing = new Set(this.data.transactions.map((t) => t.id));
    const due = dueTransactions(this.recurring, existing, todayISO());
    if (!due.length) return 0;
    this.data.transactions.push(...due);
    await db.putMany("transactions", due);
    return due.length;
  },

  // --- sync ---
  async mergeIn(remoteData) {
    const result = mergeAll(this.data, remoteData);
    for (const name of COLLECTIONS) {
      if (result.incoming[name].length) await db.putMany(name, result.incoming[name]);
      this.data[name] = result.data[name];
    }
    await this.generateRecurring();
    this.emit();
    return result.counts;
  },

  async eraseAll() {
    await db.wipeEverything();
    for (const name of COLLECTIONS) this.data[name] = [];
    this.local = {};
  }
};

function guessDeviceName() {
  const ua = globalThis.navigator?.userAgent || "";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Macintosh/.test(ua)) return navigator.maxTouchPoints > 1 ? "iPad" : "Mac";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows PC";
  return "This device";
}
