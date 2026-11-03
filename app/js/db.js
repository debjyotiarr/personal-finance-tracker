// Thin promise wrapper around IndexedDB. Data lives on this device only.

const DB_NAME = "finance-tracker";
const DB_VERSION = 1;
export const STORES = ["transactions", "categories", "accounts", "currencies", "recurring", "prefs"];
const LOCAL_STORE = "local"; // device-only settings, never synced

let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(LOCAL_STORE)) db.createObjectStore(LOCAL_STORE, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("Close other tabs running Finance Tracker, then reload."));
  });
  return dbPromise;
}

function run(storeName, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;
    Promise.resolve(fn(store)).then((r) => { result = r; });
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Storage write was aborted."));
  }));
}

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(storeName) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export function putMany(storeName, records) {
  if (!records.length) return Promise.resolve();
  return run(storeName, "readwrite", (store) => { for (const r of records) store.put(r); });
}

export function clearStore(storeName) {
  return run(storeName, "readwrite", (store) => { store.clear(); });
}

export async function getLocal(key, fallback = null) {
  const db = await open();
  const row = await requestToPromise(db.transaction(LOCAL_STORE, "readonly").objectStore(LOCAL_STORE).get(key));
  return row ? row.value : fallback;
}

export function setLocal(key, value) {
  return run(LOCAL_STORE, "readwrite", (store) => { store.put({ key, value }); });
}

export function deleteLocal(key) {
  return run(LOCAL_STORE, "readwrite", (store) => { store.delete(key); });
}

export async function wipeEverything() {
  for (const name of [...STORES, LOCAL_STORE]) await clearStore(name);
}

/** Asks the browser not to evict our data under storage pressure. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) || false;
  } catch {
    return false;
  }
}
