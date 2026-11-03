import { test } from "node:test";
import assert from "node:assert/strict";

import { evaluateAmount, convertTxn, formatMoney, convertAmount } from "../app/js/money.js";
import { mergeAll, mergeCollection, pickWinner, buildSyncFile, parseSyncFile } from "../app/js/sync.js";
import { occurrencesUntil, dueTransactions, occurrenceId } from "../app/js/recurring.js";
import {
  totals, byCategory, monthlySeries, cumulativeDaily, detectRecurring,
  monthInsights, findNearDuplicates, noteMemory, periodProgress
} from "../app/js/analytics.js";
import { monthRange, shiftMonth, niceRound } from "../app/js/util.js";
import { seedData } from "../app/js/defaults.js";

const tx = (o) => ({ type: "expense", currency: "INR", rateUSD: 0.0113, rateINR: 1, categoryId: "cat-food", note: "", ...o });

test("evaluateAmount handles arithmetic and rejects junk", () => {
  assert.equal(evaluateAmount("120+45.5"), 165.5);
  assert.equal(evaluateAmount("3*250 - 50"), 700);
  assert.equal(evaluateAmount("(10+5)/3"), 5);
  assert.equal(evaluateAmount("1,250"), 1250);
  assert.ok(Number.isNaN(evaluateAmount("alert(1)")));
  assert.ok(Number.isNaN(evaluateAmount("5+")));
  assert.ok(Number.isNaN(evaluateAmount("")));
});

test("conversion uses the rate snapshot on the transaction", () => {
  const eur = { amount: 10, currency: "EUR", rateUSD: 1.08, rateINR: 95 };
  assert.equal(convertTxn(eur, "USD"), 10.8);
  assert.equal(convertTxn(eur, "INR"), 950);
  assert.equal(convertTxn({ amount: 500, currency: "INR", rateUSD: 0.012, rateINR: 1 }, "INR"), 500);
  const table = new Map([["EUR", { toUSD: 1.1, toINR: 96 }]]);
  assert.equal(convertAmount(100, "EUR", "INR", table), 9600);
});

test("formatMoney uses Indian grouping for INR and falls back for unknown codes", () => {
  assert.equal(formatMoney(1234567, "INR"), "₹12,34,567");
  assert.equal(formatMoney(-42.5, "USD"), "−$42.50");
  assert.match(formatMoney(10, "XYZ1", { symbol: "Ꝁ" }), /Ꝁ 10/);
});

test("merge keeps newest version, propagates deletes, and is order independent", () => {
  const a = { id: "t1", amount: 10, updatedAt: 100 };
  const b = { id: "t1", amount: 20, updatedAt: 200 };
  assert.equal(pickWinner(a, b), b);
  const del = { id: "t1", deleted: true, updatedAt: 200 };
  assert.equal(pickWinner(b, del).deleted, true);

  const local = { transactions: [a, { id: "t2", updatedAt: 5 }] };
  const remote = { transactions: [b, { id: "t3", updatedAt: 7 }] };
  const ab = mergeAll(local, remote).data.transactions.sort((x, y) => x.id.localeCompare(y.id));
  const ba = mergeAll(remote, local).data.transactions.sort((x, y) => x.id.localeCompare(y.id));
  assert.deepEqual(ab, ba);
  assert.equal(ab.find((r) => r.id === "t1").amount, 20);

  const again = mergeCollection(ab, ab);
  assert.equal(again.incoming.length, 0, "merging the same data twice changes nothing");
});

test("sync file round-trips and rejects foreign files", () => {
  const data = seedData();
  const text = buildSyncFile(data, { deviceName: "iPhone" });
  const parsed = parseSyncFile(text);
  assert.equal(parsed.data.categories.length, data.categories.length);
  assert.throws(() => parseSyncFile("{\"hello\":1}"), /doesn't look like/);
  assert.throws(() => parseSyncFile("nope"), /valid JSON/);
});

test("two fresh devices merge without duplicating seed data", () => {
  const merged = mergeAll(seedData(), seedData());
  assert.equal(merged.data.categories.length, seedData().categories.length);
  assert.equal(merged.counts.categories, 0);
});

test("monthly recurrence clamps to month end and stays anchored", () => {
  const rule = { id: "r1", frequency: "monthly", startDate: "2026-01-31" };
  assert.deepEqual(occurrencesUntil(rule, "2026-04-30"), ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  const weekly = { id: "r2", frequency: "weekly", startDate: "2026-10-20" };
  assert.deepEqual(occurrencesUntil(weekly, "2026-11-03"), ["2026-10-20", "2026-10-27", "2026-11-03"]);
});

test("recurring generation skips existing and deleted occurrences", () => {
  const rule = { id: "r1", type: "expense", frequency: "monthly", startDate: "2026-09-01", amount: 20000, currency: "INR", rateUSD: 0.0113, rateINR: 1, categoryId: "cat-bills", note: "Rent" };
  const existing = new Set([occurrenceId("r1", "2026-10-01")]);
  const due = dueTransactions([rule], existing, "2026-11-03");
  assert.deepEqual(due.map((t) => t.date), ["2026-09-01", "2026-11-01"]);
  assert.equal(dueTransactions([{ ...rule, paused: true }], new Set(), "2026-11-03").length, 0);
});

test("totals exclude transfers and compute savings rate", () => {
  const txns = [
    tx({ amount: 300 }),
    tx({ amount: 1000, type: "income", categoryId: "cat-salary" }),
    tx({ amount: 5000, type: "transfer", categoryId: null })
  ];
  const t = totals(txns, "INR");
  assert.equal(t.spent, 300);
  assert.equal(t.income, 1000);
  assert.equal(t.savingsRate, 0.7);
});

test("category breakdown and monthly series", () => {
  const txns = [
    tx({ amount: 100, date: "2026-11-01" }),
    tx({ amount: 50, date: "2026-11-02", categoryId: "cat-transport" }),
    tx({ amount: 70, date: "2026-10-15" })
  ];
  const cats = byCategory(txns.filter((t) => t.date >= "2026-11-01"), "INR");
  assert.deepEqual(cats.map((c) => c.categoryId), ["cat-food", "cat-transport"]);
  const series = monthlySeries(txns, "INR", "2026-11", 3);
  assert.deepEqual(series.map((s) => s.spent), [0, 70, 150]);
  const cumulative = cumulativeDaily(txns, "INR", "2026-11");
  assert.equal(cumulative.length, 30);
  assert.equal(cumulative[0], 100);
  assert.equal(cumulative[29], 150);
});

test("detects subscriptions that repeat across months", () => {
  const txns = ["2026-08-05", "2026-09-05", "2026-10-05", "2026-11-05"].map((date) => tx({ date, amount: 649, note: "Netflix", categoryId: "cat-fun" }));
  txns.push(tx({ date: "2026-10-09", amount: 120, note: "Chai" }));
  const found = detectRecurring(txns, "INR", "2026-11");
  assert.equal(found.length, 1);
  assert.equal(found[0].label, "Netflix");
  assert.equal(Math.round(found[0].monthly), 649);
});

test("insights flag overspending against budget and recent average", () => {
  const categories = seedData().categories.map((c) => (c.id === "cat-food" ? { ...c, budget: { amount: 1000, currency: "INR" } } : c));
  const txns = [];
  for (const m of ["2026-08", "2026-09", "2026-10"]) txns.push(tx({ date: `${m}-01`, amount: 800 }), tx({ date: `${m}-20`, amount: 300 }));
  txns.push(tx({ date: "2026-11-02", amount: 1500 }));
  const insights = monthInsights({
    txns, categories, currenciesByCode: new Map(), prefs: {}, cur: "INR", key: "2026-11", todayISO: "2026-11-03"
  });
  const titles = insights.map((i) => i.title).join(" | ");
  assert.match(titles, /Food & dining is over budget/);
  assert.match(titles, /Food & dining is up/);
});

test("rent early in the month is not reported as a spike or extrapolated", () => {
  const categories = seedData().categories;
  const txns = [];
  for (const m of ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]) {
    txns.push(tx({ date: `${m}-02`, amount: 42000, note: "Rent", categoryId: "cat-bills" }));
    for (const d of ["03", "10", "14", "20"]) if (m !== "2026-11" || d <= "14") txns.push(tx({ date: `${m}-${d}`, amount: 500, note: "Swiggy" }));
  }
  const prefs = { monthlyBudget: { amount: 50000, currency: "INR" } };
  const early = monthInsights({ txns, categories, currenciesByCode: new Map(), prefs, cur: "INR", key: "2026-11", todayISO: "2026-11-03" });
  assert.ok(!early.some((i) => /Rent & bills is up/.test(i.title)), "same-day comparison means rent isn't a spike");
  assert.ok(!early.some((i) => /Heading for|On track/.test(i.title)), "no projection in the first few days");

  const mid = monthInsights({ txns, categories, currenciesByCode: new Map(), prefs, cur: "INR", key: "2026-11", todayISO: "2026-11-15" });
  const pace = mid.find((i) => /Heading for|On track/.test(i.title));
  assert.ok(pace, "projection shown mid-month");
  assert.match(pace.title, /On track/, "rent counted once, so ~44,000 projected stays under a 50,000 budget");
  assert.ok(!mid.some((i) => /One purchase was/.test(i.title)), "rent isn't called out as a one-off");
});

test("near-duplicate detection and note memory", () => {
  const existing = [tx({ id: "a", date: "2026-11-03", amount: 250, note: "Swiggy" })];
  assert.equal(findNearDuplicates(tx({ date: "2026-11-03", amount: 255 }), existing, 10).length, 1);
  assert.equal(findNearDuplicates(tx({ date: "2026-11-03", amount: 300 }), existing, 10).length, 0);
  const mem = noteMemory(existing);
  assert.equal(mem.get("swiggy").categoryId, "cat-food");
});

test("date helpers", () => {
  assert.deepEqual(monthRange("2028-02"), { start: "2028-02-01", end: "2028-02-29" });
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(niceRound(4312), 4500);
  assert.equal(periodProgress({ start: "2026-11-01", end: "2026-11-30" }, "2026-11-15"), 0.5);
});
