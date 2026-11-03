// Insights: month or year review with charts and suggestions.

import { store } from "../store.js";
import {
  inRange, totals, byCategory, monthlySeries, cumulativeDaily, weekdayPattern, largest,
  topNotes, detectRecurring, categoryAveragesToDay, monthInsights, budgetFor, periodProgress, regularMatcher
} from "../analytics.js";
import { donut, paceLine, monthBars, columnBars, meter } from "../charts.js";
import { monthKey, monthRange, yearRange, shiftMonth, todayISO, escapeHtml, daysBetween } from "../util.js";
import { money, catBadge, categoryMap, accountMap, txnRow, monthLabel, UNCATEGORISED, emptyState } from "./view.js";
import { icon } from "./dom.js";

let mode = "month";
let period = monthKey(todayISO());

export function setInsightsPeriod(params) {
  if (params.get("year")) { mode = "year"; period = params.get("year"); }
  else if (params.get("month")) { mode = "month"; period = params.get("month"); }
}

export function renderInsights(main) {
  const today = todayISO();
  const cur = store.prefs.reportCurrency;
  const all = store.transactions;
  const cats = categoryMap();
  const accts = accountMap();
  const fmt = (v) => money(v);
  const fmtShort = (v) => money(v, { compact: true });

  const range = mode === "month" ? monthRange(period) : yearRange(period);
  const months = mode === "month" ? 1 : 12;
  const scoped = inRange(all, range);
  const t = totals(scoped, cur);
  const prevRange = mode === "month" ? monthRange(shiftMonth(period, -1)) : yearRange(String(Number(period) - 1));
  const prevTotals = totals(inRange(all, prevRange), cur);
  const progress = periodProgress(range, today);
  const isCurrent = progress > 0 && progress < 1;
  const spentByCat = byCategory(scoped, cur);
  const incomeByCat = byCategory(scoped, cur, "income");
  const dayOfMonth = mode === "month" && isCurrent ? daysBetween(range.start, today) + 1 : 31;
  const { averages } = mode === "month" ? categoryAveragesToDay(all, cur, period, dayOfMonth, 3) : { averages: new Map() };
  const overall = budgetFor(store.prefs.monthlyBudget, cur, store.currenciesByCode, months);
  const nowKey = monthKey(today);
  const canNext = mode === "month" ? period < nowKey : period < today.slice(0, 4);
  const title = mode === "month" ? monthLabel(period) : period;

  const insights = mode === "month"
    ? monthInsights({ txns: all, categories: store.categories, currenciesByCode: store.currenciesByCode, prefs: store.prefs, cur, key: period, todayISO: today })
    : yearInsights(all, cur, period, cats);

  const segments = spentByCat.map((r) => {
    const c = cats.get(r.categoryId) || UNCATEGORISED;
    return { value: r.total, color: c.color, label: `${c.name}: ${fmt(r.total)}` };
  });

  const spentDelta = prevTotals.spent && !isCurrent ? (t.spent - prevTotals.spent) / prevTotals.spent : null;
  const endKey = mode === "month" ? period : (period === today.slice(0, 4) ? nowKey : `${period}-12`);
  const series = monthlySeries(all, cur, endKey, 12).map((r) => ({ ...r, label: monthLabel(r.month, { short: true }).slice(0, 3) }));

  let paceHtml = "";
  if (mode === "month") {
    const current = cumulativeDaily(all, cur, period);
    const previous = cumulativeDaily(all, cur, shiftMonth(period, -1));
    const upTo = isCurrent ? daysBetween(range.start, today) + 1 : current.length;
    const prevSame = previous[Math.min(upTo, previous.length) - 1] || 0;
    const monthBudget = budgetFor(store.prefs.monthlyBudget, cur, store.currenciesByCode);
    paceHtml = `
      <section class="panel">
        <div class="panel-head"><h2>Through the month</h2></div>
        <p class="panel-note">${isCurrent
          ? `By day ${upTo} you've spent ${escapeHtml(fmt(current[upTo - 1] || 0))}; last month at this point it was ${escapeHtml(fmt(prevSame))}.`
          : `Spending built up to ${escapeHtml(fmt(current.at(-1) || 0))}, against ${escapeHtml(fmt(previous.at(-1) || 0))} the month before.`}</p>
        ${paceLine(current, previous, { budget: monthBudget || 0, upTo, format: fmt })}
        <ul class="legend legend-lines">
          <li><i class="ln ln-cur"></i>${escapeHtml(monthLabel(period).split(" ")[0])}</li>
          <li><i class="ln ln-prev"></i>${escapeHtml(monthLabel(shiftMonth(period, -1)).split(" ")[0])}</li>
          ${monthBudget ? `<li><i class="ln ln-budget"></i>Budget</li>` : ""}
        </ul>
      </section>`;
  }

  const recurring = detectRecurring(all, cur, endKey);
  // Day-of-week habits need more than a few days of data, and rent on a
  // Monday says nothing about Mondays: use 3 months and skip regular bills.
  const weekEnd = range.end < today ? range.end : today;
  const weekRange = mode === "month" ? { start: monthRange(shiftMonth(period, -2)).start, end: weekEnd } : { start: range.start, end: weekEnd };
  const weekday = weekdayPattern(all, cur, weekRange, regularMatcher(recurring));
  const big = largest(scoped, cur, 5);
  const frequent = topNotes(scoped, cur, 5).filter((n) => n.count > 1);

  main.innerHTML = `
    <header class="page-head">
      <div><h1>Insights</h1></div>
      <div class="seg seg-small" role="group" aria-label="Report currency">
        ${["INR", "USD"].map((c) => `<button type="button" class="seg-btn" data-cur="${c}" aria-pressed="${cur === c}">${c === "INR" ? "₹ INR" : "$ USD"}</button>`).join("")}
      </div>
    </header>

    <div class="period-bar">
      <div class="seg seg-small" role="group" aria-label="Period">
        <button type="button" class="seg-btn" data-mode="month" aria-pressed="${mode === "month"}">Month</button>
        <button type="button" class="seg-btn" data-mode="year" aria-pressed="${mode === "year"}">Year</button>
      </div>
      <div class="month-step">
        <button type="button" class="icon-btn" data-step="-1" aria-label="Previous">${icon("back")}</button>
        <span class="period-title">${escapeHtml(title)}</span>
        <button type="button" class="icon-btn" data-step="1" aria-label="Next" ${canNext ? "" : "disabled"}>${icon("chevron")}</button>
      </div>
    </div>

    ${!scoped.length ? emptyState(`Nothing logged for ${title}`, all.length ? "Pick another period, or add entries for this one." : "Once you've logged a few expenses, this page shows where your money goes, how this month compares, and where you could save.", all.length ? "" : "Add a transaction") : `

    <section class="summary" aria-label="Summary">
      <div><span class="summary-label">Spent</span><strong class="amt-expense">${escapeHtml(fmt(t.spent))}</strong>
        ${spentDelta !== null ? `<small class="${spentDelta > 0 ? "up" : "down"}">${spentDelta > 0 ? "▲" : "▼"} ${Math.abs(Math.round(spentDelta * 100))}% vs ${mode === "month" ? "last month" : "last year"}</small>` : overall ? `<small>${escapeHtml(fmt(overall))} budget</small>` : ""}</div>
      <div><span class="summary-label">Income</span><strong class="amt-income">${escapeHtml(fmt(t.income))}</strong></div>
      <div><span class="summary-label">${t.net >= 0 ? "Kept" : "Overspent"}</span><strong>${escapeHtml(fmt(Math.abs(t.net)))}</strong></div>
      <div><span class="summary-label">Savings rate</span><strong>${t.savingsRate === null ? "–" : `${Math.round(t.savingsRate * 100)}%`}</strong></div>
    </section>

    ${insights.length ? `
      <section class="block">
        <div class="block-head"><h2>Worth a look</h2></div>
        <ul class="insights">
          ${insights.map((i) => `
            <li class="insight insight-${i.tone}">
              <span class="insight-dot" aria-hidden="true"></span>
              <div><p class="insight-title">${escapeHtml(i.title)}</p><p class="insight-detail">${escapeHtml(i.detail)}</p></div>
              ${i.categoryId ? `<a class="icon-btn" href="#/activity?cat=${encodeURIComponent(i.categoryId)}&month=${mode === "month" ? period : "all"}" aria-label="See entries">${icon("chevron")}</a>` : ""}
            </li>`).join("")}
        </ul>
      </section>` : ""}

    <div class="panels">
      <section class="panel panel-span">
        <div class="panel-head"><h2>Where it went</h2></div>
        <div class="where">
          ${donut(segments, { center: fmtShort(t.spent), sub: `${spentByCat.length} categor${spentByCat.length === 1 ? "y" : "ies"}` })}
          <div class="group group-flat">
            ${spentByCat.map((r) => {
              const c = cats.get(r.categoryId) || UNCATEGORISED;
              const budget = budgetFor(c.budget, cur, store.currenciesByCode, months);
              const comparable = averages.get(r.categoryId) || null;
              const delta = comparable ? (r.total - comparable) / comparable : null;
              return `
                <a class="row" href="#/activity?cat=${encodeURIComponent(r.categoryId)}&month=${mode === "month" ? period : "all"}">
                  ${catBadge(c)}
                  <span class="row-main">
                    <span class="row-title">${escapeHtml(c.name)} <span class="muted small">${t.spent ? Math.round((r.total / t.spent) * 100) : 0}%</span></span>
                    ${budget ? meter(r.total / budget, { marker: isCurrent ? progress : null }) : `<span class="row-sub">${r.count} entr${r.count === 1 ? "y" : "ies"}${delta !== null && Math.abs(delta) >= 0.1 ? `, ${delta > 0 ? "up" : "down"} ${Math.abs(Math.round(delta * 100))}% on usual` : ""}</span>`}
                  </span>
                  <span class="row-end-text ${budget && r.total > budget ? "is-over" : ""}">${escapeHtml(fmt(r.total))}${budget ? `<small>of ${escapeHtml(fmt(budget))}</small>` : ""}</span>
                </a>`;
            }).join("") || `<p class="muted">No spending in this period.</p>`}
          </div>
        </div>
      </section>

      ${paceHtml}

      <section class="panel">
        <div class="panel-head"><h2>${mode === "month" ? "Last 12 months" : `Month by month`}</h2></div>
        ${monthBars(series, { format: fmt, highlight: mode === "month" ? 11 : -1 })}
        <ul class="legend legend-lines"><li><i class="sw sw-income"></i>Income</li><li><i class="sw sw-spent"></i>Spent</li></ul>
      </section>

      <section class="panel">
        <div class="panel-head"><h2>By day of the week</h2></div>
        <p class="panel-note">Average day-to-day spending ${mode === "month" ? "over the last 3 months" : "this year"}, leaving out regular bills.</p>
        ${columnBars(weekday, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], { format: fmt })}
      </section>

      ${incomeByCat.length ? `
      <section class="panel">
        <div class="panel-head"><h2>Income sources</h2></div>
        <div class="group group-flat">
          ${incomeByCat.map((r) => {
            const c = cats.get(r.categoryId) || UNCATEGORISED;
            return `<div class="row">${catBadge(c)}<span class="row-main"><span class="row-title">${escapeHtml(c.name)}</span></span><span class="row-end-text amt-income">${escapeHtml(fmt(r.total))}</span></div>`;
          }).join("")}
        </div>
      </section>` : ""}

      ${recurring.length ? `
      <section class="panel">
        <div class="panel-head"><h2>Regular charges</h2></div>
        <p class="panel-note">Charges that repeat month after month, about ${escapeHtml(fmt(recurring.reduce((s, r) => s + r.monthly, 0)))} a month in total.</p>
        <div class="group group-flat">
          ${recurring.slice(0, 8).map((r) => {
            const c = cats.get(r.categoryId) || UNCATEGORISED;
            return `<div class="row">${catBadge(c)}<span class="row-main"><span class="row-title">${escapeHtml(r.label || c.name)}</span><span class="row-sub">${r.fromRule ? "Repeating entry" : `Seen in ${r.months} of the last 6 months`}</span></span><span class="row-end-text">${escapeHtml(fmt(r.monthly))}<small>a month</small></span></div>`;
          }).join("")}
        </div>
      </section>` : ""}

      ${big.length ? `
      <section class="panel">
        <div class="panel-head"><h2>Biggest expenses</h2></div>
        <div class="group group-flat">${big.map((b) => txnRow(b.txn, { cats, accts, showDate: true })).join("")}</div>
      </section>` : ""}

      ${frequent.length ? `
      <section class="panel">
        <div class="panel-head"><h2>Most frequent</h2></div>
        <div class="group group-flat">
          ${frequent.map((n) => {
            const c = cats.get(n.categoryId) || UNCATEGORISED;
            return `<a class="row" href="#/activity?q=${encodeURIComponent(n.label)}">${catBadge(c)}<span class="row-main"><span class="row-title">${escapeHtml(n.label)}</span><span class="row-sub">${n.count} times, about ${escapeHtml(fmt(n.total / n.count))} each</span></span><span class="row-end-text">${escapeHtml(fmt(n.total))}</span></a>`;
          }).join("")}
        </div>
      </section>` : ""}
    </div>`}
  `;

  main.querySelectorAll("[data-cur]").forEach((b) => b.addEventListener("click", () => store.savePrefs({ reportCurrency: b.dataset.cur })));
  main.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.mode === mode) return;
    mode = b.dataset.mode;
    period = mode === "year" ? (period.length === 4 ? period : period.slice(0, 4)) : (period.length === 7 ? period : (period === today.slice(0, 4) ? nowKey : `${period}-12`));
    renderInsights(main);
  }));
  main.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => {
    const step = Number(b.dataset.step);
    period = mode === "month" ? shiftMonth(period, step) : String(Number(period) + step);
    renderInsights(main);
  }));
}

function yearInsights(all, cur, year, cats) {
  const out = [];
  const keys = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const rows = monthlySeries(all, cur, `${year}-12`, 12).filter((r) => keys.includes(r.month) && (r.spent || r.income));
  if (rows.length >= 2) {
    const max = rows.reduce((a, b) => (b.spent > a.spent ? b : a));
    const min = rows.reduce((a, b) => (b.spent < a.spent ? b : a));
    out.push({ tone: "info", title: `Highest spending: ${monthLabel(max.month)}`, detail: `${money(max.spent)}, against a low of ${money(min.spent)} in ${monthLabel(min.month).split(" ")[0]}.` });
  }
  const yearT = totals(inRange(all, yearRange(year)), cur);
  const lastT = totals(inRange(all, yearRange(String(Number(year) - 1))), cur);
  if (lastT.spent) {
    const d = (yearT.spent - lastT.spent) / lastT.spent;
    out.push({ tone: d > 0.1 ? "warn" : "good", title: `Spending ${d >= 0 ? "up" : "down"} ${Math.abs(Math.round(d * 100))}% on ${Number(year) - 1}`, detail: `${money(yearT.spent)} this year, ${money(lastT.spent)} last year.` });
  }
  const byCat = byCategory(inRange(all, yearRange(year)), cur);
  if (byCat[0] && yearT.spent) {
    const c = cats.get(byCat[0].categoryId) || UNCATEGORISED;
    out.push({ tone: "info", categoryId: byCat[0].categoryId, title: `${c.name} was your biggest category`, detail: `${money(byCat[0].total)}, ${Math.round((byCat[0].total / yearT.spent) * 100)}% of all spending.` });
  }
  if (yearT.savingsRate !== null) {
    out.push({ tone: yearT.savingsRate >= 0.2 ? "good" : yearT.savingsRate < 0 ? "warn" : "info", title: `Savings rate for the year: ${Math.round(yearT.savingsRate * 100)}%`, detail: `${money(yearT.net)} kept from ${money(yearT.income)} of income.` });
  }
  return out;
}
