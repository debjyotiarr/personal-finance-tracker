// Analysis of spending. Pure functions over plain arrays.
//
// Conventions:
// - `txns` are active (non-deleted) transactions.
// - `cur` is the report currency: "INR" or "USD".
// - Transfers move money between your own accounts; they are excluded from
//   spending and income.

import { convertTxn, convertAmount, formatMoney } from "./money.js";
import {
  monthKey, monthRange, monthsBack, shiftMonth, parseISODate, daysInMonth, toISODate,
  daysBetween, normalizeText, median, sum, niceRound
} from "./util.js";

export function inRange(txns, { start, end }) {
  return txns.filter((t) => t.date >= start && t.date <= end);
}

export function totals(txns, cur) {
  let spent = 0;
  let income = 0;
  let count = 0;
  for (const t of txns) {
    if (t.type === "expense") { spent += convertTxn(t, cur); count += 1; }
    else if (t.type === "income") { income += convertTxn(t, cur); count += 1; }
  }
  const net = income - spent;
  return { spent, income, net, savingsRate: income > 0 ? net / income : null, count };
}

export function byCategory(txns, cur, type = "expense") {
  const map = new Map();
  for (const t of txns) {
    if (t.type !== type) continue;
    const key = t.categoryId || "uncategorised";
    const row = map.get(key) || { categoryId: key, total: 0, count: 0 };
    row.total += convertTxn(t, cur);
    row.count += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function monthlySeries(txns, cur, endKey, count = 12) {
  const keys = monthsBack(endKey, count);
  const index = new Map(keys.map((k, i) => [k, i]));
  const rows = keys.map((k) => ({ month: k, spent: 0, income: 0 }));
  for (const t of txns) {
    const i = index.get(monthKey(t.date));
    if (i === undefined) continue;
    if (t.type === "expense") rows[i].spent += convertTxn(t, cur);
    else if (t.type === "income") rows[i].income += convertTxn(t, cur);
  }
  return rows;
}

/** Running total of spending for each day of a month. */
export function cumulativeDaily(txns, cur, key) {
  const [y, m] = key.split("-").map(Number);
  const days = daysInMonth(y, m - 1);
  const daily = new Array(days).fill(0);
  for (const t of txns) {
    if (t.type !== "expense" || monthKey(t.date) !== key) continue;
    daily[Number(t.date.slice(8, 10)) - 1] += convertTxn(t, cur);
  }
  let run = 0;
  return daily.map((v) => (run += v));
}

/** Average spend per weekday (Mon..Sun) over a period. */
export function weekdayPattern(txns, cur, { start, end }, exclude = () => false) {
  const totalsByDay = new Array(7).fill(0);
  const dayCounts = new Array(7).fill(0);
  const span = daysBetween(start, end) + 1;
  const first = parseISODate(start);
  for (let i = 0; i < span; i += 1) {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    dayCounts[(d.getDay() + 6) % 7] += 1;
  }
  for (const t of txns) {
    if (t.type !== "expense" || t.date < start || t.date > end || exclude(t)) continue;
    totalsByDay[(parseISODate(t.date).getDay() + 6) % 7] += convertTxn(t, cur);
  }
  return totalsByDay.map((v, i) => (dayCounts[i] ? v / dayCounts[i] : 0));
}

export function largest(txns, cur, n = 5, type = "expense") {
  return txns
    .filter((t) => t.type === type)
    .map((t) => ({ txn: t, value: convertTxn(t, cur) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

/** Groups expenses by note ("merchant") within a period. */
export function topNotes(txns, cur, n = 5) {
  const map = new Map();
  for (const t of txns) {
    if (t.type !== "expense") continue;
    const key = normalizeText(t.note);
    if (!key) continue;
    const row = map.get(key) || { label: t.note.trim(), total: 0, count: 0, categoryId: t.categoryId };
    row.total += convertTxn(t, cur);
    row.count += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.total - a.total).slice(0, n);
}

/**
 * Finds charges that look like subscriptions or regular bills: the same note
 * and category, in at least 3 of the last 6 months, with amounts within 15%
 * of their median. Transactions already created by a recurring rule count too.
 */
export function detectRecurring(txns, cur, endKey) {
  const window = new Set(monthsBack(endKey, 6));
  const groups = new Map();
  for (const t of txns) {
    if (t.type !== "expense" || !window.has(monthKey(t.date))) continue;
    const noteKey = normalizeText(t.note);
    if (!noteKey && !t.recurringId) continue;
    const key = t.recurringId ? `rule:${t.recurringId}` : `${noteKey}|${t.categoryId}`;
    const g = groups.get(key) || { label: t.note?.trim() || "", categoryId: t.categoryId, items: [], fromRule: Boolean(t.recurringId) };
    g.items.push({ month: monthKey(t.date), value: convertTxn(t, cur), date: t.date });
    groups.set(key, g);
  }
  const out = [];
  for (const g of groups.values()) {
    const months = new Set(g.items.map((i) => i.month));
    if (months.size < 3 && !g.fromRule) continue;
    const values = g.items.map((i) => i.value);
    const mid = median(values);
    if (!g.fromRule && values.some((v) => Math.abs(v - mid) > mid * 0.15)) continue;
    const perMonth = sum(values) / Math.max(months.size, 1);
    const lastDate = g.items.map((i) => i.date).sort().at(-1);
    out.push({ label: g.label, categoryId: g.categoryId, monthly: perMonth, months: months.size, lastDate, fromRule: g.fromRule });
  }
  return out.sort((a, b) => b.monthly - a.monthly);
}

/** Average monthly spend per category over the `n` full months before `key`. */
export function categoryAverages(txns, cur, key, n = 3) {
  const months = monthsBack(shiftMonth(key, -1), n);
  const set = new Set(months);
  const totalsByCat = new Map();
  for (const t of txns) {
    if (t.type !== "expense" || !set.has(monthKey(t.date))) continue;
    const k = t.categoryId || "uncategorised";
    totalsByCat.set(k, (totalsByCat.get(k) || 0) + convertTxn(t, cur));
  }
  const firstWithData = txns.length ? txns.reduce((min, t) => (t.date < min ? t.date : min), "9999") : null;
  const monthsWithHistory = firstWithData ? months.filter((m) => m >= monthKey(firstWithData)).length : 0;
  const divisor = Math.max(monthsWithHistory, 1);
  const averages = new Map();
  for (const [k, v] of totalsByCat) averages.set(k, v / divisor);
  return { averages, monthsWithHistory };
}

/**
 * Average spend per category in the `n` months before `key`, counting only
 * days 1..`day` of each month. Comparing like with like means a rent payment
 * on the 2nd isn't mistaken for a spike.
 */
export function categoryAveragesToDay(txns, cur, key, day, n = 3) {
  const months = monthsBack(shiftMonth(key, -1), n);
  const set = new Set(months);
  const firstKey = txns.length ? monthKey(txns.reduce((min, t) => (t.date < min ? t.date : min), "9999")) : null;
  const monthsWithHistory = firstKey ? months.filter((m) => m >= firstKey).length : 0;
  const totalsByCat = new Map();
  for (const t of txns) {
    if (t.type !== "expense") continue;
    const mk = monthKey(t.date);
    if (!set.has(mk)) continue;
    const [y, m] = mk.split("-").map(Number);
    if (Number(t.date.slice(8, 10)) > Math.min(day, daysInMonth(y, m - 1))) continue;
    const k = t.categoryId || "uncategorised";
    totalsByCat.set(k, (totalsByCat.get(k) || 0) + convertTxn(t, cur));
  }
  const averages = new Map();
  for (const [k, v] of totalsByCat) averages.set(k, v / Math.max(monthsWithHistory, 1));
  return { averages, monthsWithHistory };
}

/** Keys identifying regular charges, so they can be kept out of run-rate maths. */
export function regularMatcher(recurring) {
  const keys = new Set(recurring.filter((r) => !r.fromRule).map((r) => `${normalizeText(r.label)}|${r.categoryId}`));
  return (t) => Boolean(t.recurringId) || keys.has(`${normalizeText(t.note)}|${t.categoryId}`);
}

/**
 * Projects month-end spending. Regular charges (rent, subscriptions) count
 * once at their usual size; only day-to-day spending is extrapolated.
 */
export function projectMonth(monthTxns, cur, progress, { isRegular, expectedRegular = 0, categoryId = null }) {
  let regular = 0;
  let variable = 0;
  for (const t of monthTxns) {
    if (t.type !== "expense") continue;
    if (categoryId && (t.categoryId || "uncategorised") !== categoryId) continue;
    if (isRegular(t)) regular += convertTxn(t, cur); else variable += convertTxn(t, cur);
  }
  const regularTotal = Math.max(regular, expectedRegular);
  return { projected: regularTotal + (progress > 0 ? variable / progress : variable), regular, variable, regularStillDue: regularTotal - regular };
}

/** Budget in the report currency for a period of `months` months. */
export function budgetFor(budget, cur, currenciesByCode, months = 1) {
  if (!budget || !budget.amount) return null;
  return convertAmount(budget.amount, budget.currency, cur, currenciesByCode) * months;
}

/** How far through a period today is (0..1). Past periods return 1. */
export function periodProgress({ start, end }, todayISO) {
  if (todayISO >= end) return 1;
  if (todayISO < start) return 0;
  return (daysBetween(start, todayISO) + 1) / (daysBetween(start, end) + 1);
}

/** Suggested monthly budget for a category, from recent history. */
export function suggestBudget(averages, categoryId) {
  const avg = averages.get(categoryId);
  return avg ? niceRound(avg) : null;
}

/**
 * Plain-language observations and suggestions for a month.
 * Returns [{ tone: "warn" | "good" | "info", title, detail, categoryId? }]
 */
export function monthInsights({ txns, categories, currenciesByCode, prefs, cur, key, todayISO }) {
  const out = [];
  const range = monthRange(key);
  const monthTxns = inRange(txns, range);
  const t = totals(monthTxns, cur);
  const fmt = (v) => formatMoney(Math.round(v), cur);
  const catById = new Map(categories.map((c) => [c.id, c]));
  const catName = (id) => catById.get(id)?.name || "Uncategorised";
  const progress = periodProgress(range, todayISO);
  const isCurrent = progress > 0 && progress < 1;
  const daysTotal = daysBetween(range.start, range.end) + 1;
  const daysGone = isCurrent ? daysBetween(range.start, todayISO) + 1 : daysTotal;
  const daysLeft = daysTotal - daysGone;
  const spentByCat = byCategory(monthTxns, cur);
  const { averages, monthsWithHistory } = categoryAverages(txns, cur, key, 3);
  const { averages: toDay } = categoryAveragesToDay(txns, cur, key, daysGone, 3);
  const recurring = detectRecurring(txns, cur, shiftMonth(key, -1));
  const isRegular = regularMatcher(recurring);
  const expectedRegularFor = (catId) => sum(recurring.filter((r) => !catId || r.categoryId === catId).map((r) => r.monthly));
  // Too early in the month to extrapolate meaningfully.
  const canProject = isCurrent && daysGone >= 5;

  if (!monthTxns.length) return out;

  // Overall budget pace.
  const overall = budgetFor(prefs?.monthlyBudget, cur, currenciesByCode);
  if (overall) {
    if (t.spent > overall) {
      out.push({ tone: "warn", title: `Over your monthly budget by ${fmt(t.spent - overall)}`, detail: `You've spent ${fmt(t.spent)} against a budget of ${fmt(overall)}.` });
    } else if (canProject) {
      const p = projectMonth(monthTxns, cur, progress, { isRegular, expectedRegular: expectedRegularFor(null) });
      if (p.projected > overall * 1.05) {
        const perDay = (overall - t.spent - p.regularStillDue) / Math.max(1, daysLeft);
        out.push({ tone: "warn", title: `Heading for about ${fmt(p.projected)} this month`, detail: perDay > 0
          ? `That's ${fmt(p.projected - overall)} over budget. Keeping day-to-day spending to ${fmt(perDay)} a day from here keeps you on track.`
          : `That's ${fmt(p.projected - overall)} over budget, with regular bills still to come.` });
      } else {
        out.push({ tone: "good", title: `On track: ${fmt(overall - t.spent)} left in your budget`, detail: `At this pace, with your regular bills, you'll finish the month around ${fmt(p.projected)}.` });
      }
    } else if (progress === 1) {
      out.push({ tone: "good", title: `Finished ${fmt(overall - t.spent)} under budget`, detail: `You spent ${fmt(t.spent)} of ${fmt(overall)}.` });
    }
  }

  // Category budgets.
  for (const row of spentByCat) {
    const cat = catById.get(row.categoryId);
    const budget = budgetFor(cat?.budget, cur, currenciesByCode);
    if (!budget) continue;
    if (row.total > budget) {
      out.push({ tone: "warn", categoryId: row.categoryId, title: `${cat.name} is over budget by ${fmt(row.total - budget)}`, detail: `${fmt(row.total)} spent of ${fmt(budget)}.` });
    } else if (canProject) {
      const p = projectMonth(monthTxns, cur, progress, { isRegular, expectedRegular: expectedRegularFor(row.categoryId), categoryId: row.categoryId });
      if (p.projected > budget * 1.1) {
        out.push({ tone: "warn", categoryId: row.categoryId, title: `${cat.name} is running ahead of budget`, detail: `${Math.round((row.total / budget) * 100)}% used with ${daysLeft} day${daysLeft === 1 ? "" : "s"} to go; on pace for about ${fmt(p.projected)}.` });
      }
    }
  }

  // Changes against what you'd usually have spent by this day of the month.
  if (monthsWithHistory >= 1) {
    for (const row of spentByCat.slice(0, 8)) {
      const comparable = toDay.get(row.categoryId) || 0;
      const diff = row.total - comparable;
      if (comparable > 0 && diff / comparable > 0.3 && diff > t.spent * 0.05) {
        out.push({
          tone: "info",
          categoryId: row.categoryId,
          title: `${catName(row.categoryId)} is up ${Math.round((diff / comparable) * 100)}%`,
          detail: `${fmt(row.total)}${isCurrent ? " so far" : ""}, against a usual ${fmt(comparable)}${isCurrent ? ` by day ${daysGone}` : ""} (average of the last ${monthsWithHistory} month${monthsWithHistory > 1 ? "s" : ""}).`
        });
      } else if (!comparable && averages.get(row.categoryId) === undefined && row.total > t.spent * 0.1 && monthsWithHistory >= 2) {
        out.push({ tone: "info", categoryId: row.categoryId, title: `New this month: ${catName(row.categoryId)}`, detail: `${fmt(row.total)}, where the last ${monthsWithHistory} months had nothing.` });
      }
    }
    for (const [catId, avg] of averages) {
      if (spentByCat.some((r) => r.categoryId === catId)) continue;
      if (progress === 1 && avg > t.spent * 0.05) {
        out.push({ tone: "good", categoryId: catId, title: `Nothing spent on ${catName(catId)}`, detail: `You usually spend about ${fmt(avg)} a month here.` });
      }
    }
  }

  // Savings rate.
  if (t.income > 0) {
    const rate = t.savingsRate;
    if (rate < 0) out.push({ tone: "warn", title: `Spending is ${fmt(-t.net)} more than income`, detail: "Money out is ahead of money in for this month." });
    else if (progress === 1 && rate >= 0.2) out.push({ tone: "good", title: `You saved ${Math.round(rate * 100)}% of your income`, detail: `${fmt(t.net)} kept from ${fmt(t.income)}.` });
  }

  // Frequent small purchases.
  for (const row of topNotes(monthTxns, cur, 10)) {
    if (row.count >= 6 && row.total > t.spent * 0.04) {
      out.push({ tone: "info", categoryId: row.categoryId, title: `${row.label}: ${row.count} times, ${fmt(row.total)}`, detail: `About ${fmt(row.total / row.count)} each. Small, frequent spends like this are often the easiest to trim.` });
      break;
    }
  }

  // A one-off that dominated the month (regular bills like rent don't count).
  const top = largest(monthTxns.filter((x) => !isRegular(x)), cur, 1)[0];
  if (top && t.spent > 0 && top.value / t.spent > 0.25 && monthTxns.length > 3) {
    const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(parseISODate(top.txn.date));
    out.push({ tone: "info", title: `One purchase was ${Math.round((top.value / t.spent) * 100)}% of the month`, detail: `${top.txn.note || catName(top.txn.categoryId)} on ${when}: ${fmt(top.value)}.` });
  }

  // Subscriptions and regular bills.
  const recurringNow = detectRecurring(txns, cur, key);
  if (recurringNow.length >= 2) {
    const monthly = sum(recurringNow.map((r) => r.monthly));
    out.push({ tone: "info", title: `${recurringNow.length} regular charges, about ${fmt(monthly)} a month`, detail: "Worth checking now and then that each one is still earning its place." });
  }

  // Budget suggestions for heavy categories without one.
  const unbudgeted = spentByCat.filter((r) => !catById.get(r.categoryId)?.budget && averages.get(r.categoryId) > 0).slice(0, 2);
  if (monthsWithHistory >= 2 && unbudgeted.length && !overall) {
    const names = unbudgeted.map((r) => `${catName(r.categoryId)} (${fmt(suggestBudget(averages, r.categoryId))})`).join(" and ");
    out.push({ tone: "info", title: "Set a budget to track progress", detail: `Based on recent months, try ${names}. Budgets are in Settings › Categories.` });
  }

  const order = { warn: 0, info: 1, good: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}

/** Possible duplicates of a draft transaction: same date and category, amount within tolerance. */
export function findNearDuplicates(draft, txns, tolerance = 10) {
  return txns.filter((t) =>
    t.id !== draft.id &&
    t.type === draft.type &&
    t.date === draft.date &&
    (t.categoryId || null) === (draft.categoryId || null) &&
    t.currency === draft.currency &&
    Math.abs(Number(t.amount) - Number(draft.amount)) <= tolerance
  );
}

/**
 * Learns which category goes with a note, from past entries.
 * Returns Map(normalizedNote -> { categoryId, note, count, lastAmount, type, accountId }).
 */
export function noteMemory(txns) {
  const map = new Map();
  const sorted = [...txns].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const t of sorted) {
    const key = normalizeText(t.note);
    if (!key) continue;
    const prev = map.get(key);
    map.set(key, {
      note: t.note.trim(),
      categoryId: t.categoryId,
      type: t.type,
      accountId: t.accountId,
      currency: t.currency,
      lastAmount: t.amount,
      count: (prev?.count || 0) + 1
    });
  }
  return map;
}

/** Categories ordered by how often they were used recently. */
export function categoryUsage(txns, todayISO, days = 90) {
  const cutoff = parseISODate(todayISO);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffISO = toISODate(cutoff);
  const counts = new Map();
  for (const t of txns) {
    if (t.date < cutoffISO || !t.categoryId) continue;
    counts.set(t.categoryId, (counts.get(t.categoryId) || 0) + 1);
  }
  return counts;
}
