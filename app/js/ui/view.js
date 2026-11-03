// Shared rendering helpers used by several screens.

import { store } from "../store.js";
import { formatMoney, convertTxn } from "../money.js";
import { escapeHtml, todayISO, addDays, parseISODate } from "../util.js";

export function reportCurrency() {
  return store.prefs.reportCurrency || "INR";
}

export function money(value, opts = {}) {
  return formatMoney(value, reportCurrency(), opts);
}

export function moneyIn(value, code, opts = {}) {
  const cur = store.currenciesByCode.get(code);
  return formatMoney(value, code, { symbol: cur?.symbol, ...opts });
}

export function categoryMap() {
  return new Map(store.active("categories").map((c) => [c.id, c]));
}

export function accountMap() {
  return new Map(store.active("accounts").map((a) => [a.id, a]));
}

export function accountLabel(account) {
  if (!account) return "";
  return account.last4 ? `${account.name} ••${account.last4}` : account.name;
}

export const UNCATEGORISED = { id: "uncategorised", name: "Uncategorised", emoji: "❔", color: "#8A9490" };
export const TRANSFER_CAT = { id: "transfer", name: "Transfer", emoji: "⇄", color: "#7C8590" };

export function catFor(txn, cats = categoryMap()) {
  if (txn.type === "transfer") return TRANSFER_CAT;
  return cats.get(txn.categoryId) || UNCATEGORISED;
}

export function catBadge(cat, size = "") {
  return `<span class="cat-badge ${size}" style="--c:${cat.color}" aria-hidden="true">${escapeHtml(cat.emoji || "•")}</span>`;
}

export function dayLabel(iso) {
  const today = todayISO();
  if (iso === today) return "Today";
  if (iso === addDays(today, -1)) return "Yesterday";
  const d = parseISODate(iso);
  const sameYear = iso.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).format(d);
}

export function monthLabel(key, { short = false } = {}) {
  const d = parseISODate(`${key}-01`);
  return new Intl.DateTimeFormat("en-GB", short ? { month: "short" } : { month: "long", year: "numeric" }).format(d);
}

export function relativeTime(ms) {
  if (!ms) return "never";
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d > 1 ? "s" : ""} ago`;
}

/** Signed amount for a transaction in its own currency. */
export function txnAmountText(txn) {
  const text = moneyIn(txn.amount, txn.currency, { decimals: Number.isInteger(Number(txn.amount)) ? 0 : 2 });
  if (txn.type === "income") return `+${text}`;
  if (txn.type === "expense") return `−${text}`;
  return text;
}

/** One transaction row for lists. */
export function txnRow(txn, { cats = categoryMap(), accts = accountMap(), showDate = false } = {}) {
  const cat = catFor(txn, cats);
  const rc = reportCurrency();
  const foreign = txn.currency !== rc;
  const title = txn.note || cat.name;
  const subParts = [];
  if (txn.note) subParts.push(cat.name);
  if (txn.type === "transfer") {
    subParts.push(`${accountLabel(accts.get(txn.accountId)) || "?"} → ${accountLabel(accts.get(txn.toAccountId)) || "?"}`);
  } else if (txn.accountId && accts.get(txn.accountId)) {
    subParts.push(accountLabel(accts.get(txn.accountId)));
  }
  if (showDate) subParts.push(dayLabel(txn.date));
  return `
    <button type="button" class="txn" data-txn="${escapeHtml(txn.id)}">
      ${catBadge(cat)}
      <span class="txn-main">
        <span class="txn-title">${escapeHtml(title)}${txn.recurringId ? `<span class="txn-tag" title="Repeats">↻</span>` : ""}${txn.flag === "near_duplicate" ? `<span class="txn-tag warn" title="Possible duplicate">2×</span>` : ""}</span>
        <span class="txn-sub">${escapeHtml(subParts.join(", "))}</span>
      </span>
      <span class="txn-amt ${txn.type}">
        ${escapeHtml(txnAmountText(txn))}
        ${foreign ? `<small>${escapeHtml(money(convertTxn(txn, rc)))}</small>` : ""}
      </span>
    </button>`;
}

export function emptyState(title, body, actionLabel, action = "add") {
  return `
    <div class="empty">
      <p class="empty-title">${escapeHtml(title)}</p>
      <p class="muted">${escapeHtml(body)}</p>
      ${actionLabel ? `<button type="button" class="btn btn-primary" data-action="${escapeHtml(action)}">${escapeHtml(actionLabel)}</button>` : ""}
    </div>`;
}
