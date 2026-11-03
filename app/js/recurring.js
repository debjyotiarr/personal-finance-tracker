// Recurring transactions (rent, subscriptions, salary...).
//
// Generation is stateless: every occurrence from the start date up to today
// gets a deterministic transaction id (`rec-<ruleId>-<date>`). The app creates
// any occurrence whose id doesn't exist yet. Because a deleted occurrence
// leaves a tombstone with the same id, it is never re-created, and two devices
// generating the same occurrence produce the same record, so sync stays clean.

import { pad2, parseISODate, toISODate, daysInMonth } from "./util.js";

export const FREQUENCIES = {
  weekly: "Every week",
  monthly: "Every month",
  quarterly: "Every 3 months",
  yearly: "Every year"
};

function addMonthsAnchored(startISO, months) {
  const start = parseISODate(startISO);
  const anchorDay = start.getDate();
  const target = new Date(start.getFullYear(), start.getMonth() + months, 1, 12);
  const day = Math.min(anchorDay, daysInMonth(target.getFullYear(), target.getMonth()));
  return `${target.getFullYear()}-${pad2(target.getMonth() + 1)}-${pad2(day)}`;
}

/** The nth occurrence (0-based) of a rule. */
export function occurrenceDate(rule, n) {
  switch (rule.frequency) {
    case "weekly": {
      const d = parseISODate(rule.startDate);
      d.setDate(d.getDate() + 7 * n);
      return toISODate(d);
    }
    case "quarterly":
      return addMonthsAnchored(rule.startDate, 3 * n);
    case "yearly":
      return addMonthsAnchored(rule.startDate, 12 * n);
    case "monthly":
    default:
      return addMonthsAnchored(rule.startDate, n);
  }
}

/** All occurrence dates of a rule on or before `untilISO`. */
export function occurrencesUntil(rule, untilISO, limit = 2000) {
  const out = [];
  const end = rule.endDate && rule.endDate < untilISO ? rule.endDate : untilISO;
  for (let n = 0; n < limit; n += 1) {
    const date = occurrenceDate(rule, n);
    if (date > end) break;
    out.push(date);
  }
  return out;
}

export function nextOccurrence(rule, afterISO) {
  for (let n = 0; n < 5000; n += 1) {
    const date = occurrenceDate(rule, n);
    if (rule.endDate && date > rule.endDate) return null;
    if (date > afterISO) return date;
  }
  return null;
}

export function occurrenceId(ruleId, date) {
  return `rec-${ruleId}-${date}`;
}

/**
 * Builds the transactions that should exist for active rules but don't yet.
 * `existingIds` must include tombstoned ids.
 */
export function dueTransactions(rules, existingIds, todayISO, now = Date.now()) {
  const created = [];
  for (const rule of rules) {
    if (rule.deleted || rule.paused) continue;
    for (const date of occurrencesUntil(rule, todayISO)) {
      const id = occurrenceId(rule.id, date);
      if (existingIds.has(id)) continue;
      created.push({
        id,
        type: rule.type,
        date,
        amount: rule.amount,
        currency: rule.currency,
        rateUSD: rule.rateUSD,
        rateINR: rule.rateINR,
        categoryId: rule.categoryId || null,
        accountId: rule.accountId || null,
        toAccountId: rule.toAccountId || null,
        note: rule.note || "",
        recurringId: rule.id,
        flag: "none",
        createdAt: now,
        updatedAt: now
      });
    }
  }
  return created;
}
