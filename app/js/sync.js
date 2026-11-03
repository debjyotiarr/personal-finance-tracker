// File-based sync.
//
// Each device keeps a full copy of the data. To sync, a device reads a sync
// file (kept in iCloud Drive, Google Drive or any shared folder), merges it
// into its own data, and writes the merged result back out.
//
// The merge is per record: the version with the later `updatedAt` wins.
// Deletions are kept as tombstones ({deleted: true}) so they propagate too.
// The merge is idempotent and order-independent, so merging the same file
// twice, or merging several old copies, is always safe.

export const SYNC_FORMAT = "finance-tracker-sync";
export const SYNC_VERSION = 2;
export const COLLECTIONS = ["transactions", "categories", "accounts", "currencies", "recurring", "prefs"];

/** Decides which of two versions of the same record to keep. */
export function pickWinner(a, b) {
  if (!a) return b;
  if (!b) return a;
  const ta = Number(a.updatedAt) || 0;
  const tb = Number(b.updatedAt) || 0;
  if (ta !== tb) return ta > tb ? a : b;
  if (Boolean(a.deleted) !== Boolean(b.deleted)) return a.deleted ? a : b;
  // Deterministic tie-break so every device lands on the same answer.
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

/**
 * Merges remote records into local ones.
 * Returns { merged, incoming } where `incoming` lists records that changed
 * locally as a result (new or newer from remote).
 */
export function mergeCollection(localRecords, remoteRecords) {
  const byId = new Map(localRecords.map((r) => [r.id, r]));
  const incoming = [];
  for (const remote of remoteRecords || []) {
    if (!remote || typeof remote.id !== "string") continue;
    const local = byId.get(remote.id);
    const winner = pickWinner(local, remote);
    if (winner !== local && JSON.stringify(winner) !== JSON.stringify(local)) {
      byId.set(remote.id, winner);
      incoming.push(winner);
    }
  }
  return { merged: [...byId.values()], incoming };
}

export function mergeAll(localData, remoteData) {
  const result = { data: {}, incoming: {}, counts: {} };
  for (const name of COLLECTIONS) {
    const { merged, incoming } = mergeCollection(localData[name] || [], remoteData[name] || []);
    result.data[name] = merged;
    result.incoming[name] = incoming;
    result.counts[name] = incoming.length;
  }
  return result;
}

export function buildSyncFile(data, { deviceId, deviceName } = {}) {
  const payload = {
    format: SYNC_FORMAT,
    version: SYNC_VERSION,
    exportedAt: new Date().toISOString(),
    deviceId: deviceId || "",
    deviceName: deviceName || "",
    data: {}
  };
  for (const name of COLLECTIONS) payload.data[name] = data[name] || [];
  return JSON.stringify(payload);
}

export function parseSyncFile(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("This file isn't valid JSON. Choose a Finance Tracker sync file.");
  }
  if (!parsed || parsed.format !== SYNC_FORMAT || typeof parsed.data !== "object") {
    throw new Error("This doesn't look like a Finance Tracker sync file.");
  }
  if (Number(parsed.version) > SYNC_VERSION) {
    throw new Error("This sync file was made by a newer version of the app. Reload the app to update, then try again.");
  }
  const data = {};
  for (const name of COLLECTIONS) {
    data[name] = Array.isArray(parsed.data[name]) ? parsed.data[name].filter((r) => r && typeof r.id === "string") : [];
  }
  return { meta: { exportedAt: parsed.exportedAt, deviceName: parsed.deviceName || "" }, data };
}

/** Counts records edited after `since` (ms). */
export function countChangesSince(data, since) {
  let n = 0;
  for (const name of COLLECTIONS) {
    for (const r of data[name] || []) if ((Number(r.updatedAt) || 0) > (since || 0)) n += 1;
  }
  return n;
}
