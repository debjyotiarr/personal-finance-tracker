// Small, dependency-free helpers shared by the data layer and the UI.
// Everything here is pure so it can be unit-tested in Node.

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function toISODate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseISODate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
}

export function todayISO(now = new Date()) {
  return toISODate(now);
}

export function addDays(iso, days) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function monthKey(iso) {
  return String(iso).slice(0, 7);
}

export function daysInMonth(year, monthIndex0) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

export function monthRange(key) {
  const [y, m] = key.split("-").map(Number);
  return { start: `${key}-01`, end: `${key}-${pad2(daysInMonth(y, m - 1))}` };
}

export function yearRange(year) {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

export function shiftMonth(key, delta) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function monthsBack(endKey, count) {
  const out = [];
  for (let i = count - 1; i >= 0; i -= 1) out.push(shiftMonth(endKey, -i));
  return out;
}

export function daysBetween(startISO, endISO) {
  return Math.round((parseISODate(endISO) - parseISODate(startISO)) / 86400000);
}

export function uid(prefix = "") {
  const rand = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}-${rand}` : rand;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9ऀ-ॿ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Rounds to a friendly budget figure (e.g. 4,312 -> 4,500). */
export function niceRound(n) {
  if (n <= 0) return 0;
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1);
  const step = magnitude * 5;
  return Math.ceil(n / step) * step;
}

export function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

export function toCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}
