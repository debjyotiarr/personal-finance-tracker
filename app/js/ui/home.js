// Home: this month at a glance, budgets, recent entries.

import { store } from "../store.js";
import { totals, byCategory, inRange, budgetFor, periodProgress } from "../analytics.js";
import { countChangesSince } from "../sync.js";
import { ribbon, meter } from "../charts.js";
import { monthKey, monthRange, todayISO, daysBetween, escapeHtml } from "../util.js";
import { money, catBadge, categoryMap, accountMap, txnRow, emptyState, monthLabel, UNCATEGORISED, relativeTime } from "./view.js";
import { icon } from "./dom.js";

export function renderHome(main) {
  const today = todayISO();
  const key = monthKey(today);
  const range = monthRange(key);
  const cur = store.prefs.reportCurrency;
  const all = store.transactions;
  const month = inRange(all, range);
  const t = totals(month, cur);
  const cats = categoryMap();
  const accts = accountMap();
  const spentByCat = byCategory(month, cur);
  const progress = periodProgress(range, today);
  const overall = budgetFor(store.prefs.monthlyBudget, cur, store.currenciesByCode);
  const daysLeft = daysBetween(today, range.end);

  const segments = spentByCat.map((row) => {
    const c = cats.get(row.categoryId) || UNCATEGORISED;
    return { value: row.total, color: c.color, label: `${c.name} ${money(row.total)}` };
  });

  let sub;
  if (overall) {
    const left = overall - t.spent;
    sub = left >= 0
      ? `${money(left)} left of ${money(overall)}, ${daysLeft === 0 ? "last day of the month" : `${daysLeft} day${daysLeft > 1 ? "s" : ""} to go`}`
      : `${money(-left)} over your ${money(overall)} budget`;
  } else if (t.income) {
    sub = `${money(t.income)} came in, ${t.net >= 0 ? `${money(t.net)} kept so far` : `${money(-t.net)} more out than in`}`;
  } else {
    sub = t.count ? `${t.count} entr${t.count === 1 ? "y" : "ies"} this month` : "Nothing logged yet this month";
  }

  const recent = [...all].sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1)).slice(0, 6);

  const budgetRows = store.categories
    .filter((c) => c.kind === "expense" && c.budget?.amount)
    .map((c) => {
      const spent = spentByCat.find((r) => r.categoryId === c.id)?.total || 0;
      const budget = budgetFor(c.budget, cur, store.currenciesByCode);
      return { c, spent, budget, ratio: budget ? spent / budget : 0 };
    })
    .sort((a, b) => b.ratio - a.ratio);

  const topRows = budgetRows.length ? [] : spentByCat.slice(0, 5);
  const maxTop = topRows[0]?.total || 1;

  const changes = countChangesSince(store.data, store.local.lastSyncAt || 0);
  const syncStale = changes > 0 && (!store.local.lastSyncAt || Date.now() - store.local.lastSyncAt > 7 * 864e5);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const isiPhone = /iPhone|iPad/.test(navigator.userAgent);
  const showInstall = isiPhone && !standalone && !store.local.installHintDismissed;

  main.innerHTML = `
    <header class="page-head">
      <div>
        <p class="page-kicker">${escapeHtml(new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date()))}</p>
        <h1>${escapeHtml(monthLabel(key).split(" ")[0])}</h1>
      </div>
      <a class="sync-chip ${syncStale ? "is-stale" : ""}" href="#/settings/sync" aria-label="Sync">${icon("sync")}<span>${store.local.lastSyncAt ? relativeTime(store.local.lastSyncAt) : "Not synced"}</span></a>
    </header>

    ${showInstall ? `
      <div class="callout callout-accent">
        <span><strong>Add this app to your Home Screen.</strong> Tap Share, then “Add to Home Screen”. Safari can clear data from websites you haven't opened in a while; Home Screen apps keep theirs.</span>
        <button type="button" class="icon-btn" data-dismiss-install aria-label="Dismiss">${icon("close")}</button>
      </div>` : ""}

    <section class="hero" aria-label="This month">
      <p class="hero-label">Spent in ${escapeHtml(monthLabel(key).split(" ")[0])}</p>
      <p class="hero-num">${escapeHtml(money(t.spent))}</p>
      ${ribbon(segments, { budget: overall || 0, marker: overall ? progress : null })}
      <p class="hero-sub">${escapeHtml(sub)}</p>
      ${segments.length ? `<ul class="legend">${spentByCat.slice(0, 4).map((r) => {
        const c = cats.get(r.categoryId) || UNCATEGORISED;
        return `<li><i style="background:${c.color}"></i>${escapeHtml(c.name)}</li>`;
      }).join("")}${spentByCat.length > 4 ? `<li class="muted">+${spentByCat.length - 4} more</li>` : ""}</ul>` : ""}
    </section>

    ${syncStale ? `
      <a class="callout" href="#/settings/sync">
        <span>${changes} change${changes > 1 ? "s" : ""} on this ${escapeHtml(store.local.deviceName || "device")} since the last sync.</span>
        <span class="callout-link">Sync now</span>
      </a>` : ""}

    ${!all.length ? emptyState("Start with today's spending", "Log an expense in a couple of taps. Over the month, this screen fills in with where your money goes.", "Add your first expense") : ""}

    ${budgetRows.length ? `
      <section class="block">
        <div class="block-head"><h2>Budgets</h2><a href="#/insights" class="link">Insights</a></div>
        <div class="group">
          ${budgetRows.map(({ c, spent, budget, ratio }) => `
            <a class="row" href="#/activity?cat=${c.id}&month=${key}">
              ${catBadge(c)}
              <span class="row-main">
                <span class="row-title">${escapeHtml(c.name)}</span>
                ${meter(ratio, { marker: progress })}
              </span>
              <span class="row-end-text ${ratio > 1 ? "is-over" : ""}">${escapeHtml(money(spent))}<small>of ${escapeHtml(money(budget))}</small></span>
            </a>`).join("")}
        </div>
      </section>` : ""}

    ${topRows.length ? `
      <section class="block">
        <div class="block-head"><h2>Where it went</h2><a href="#/insights" class="link">Insights</a></div>
        <div class="group">
          ${topRows.map((r) => {
            const c = cats.get(r.categoryId) || UNCATEGORISED;
            return `
            <a class="row" href="#/activity?cat=${r.categoryId}&month=${key}">
              ${catBadge(c)}
              <span class="row-main">
                <span class="row-title">${escapeHtml(c.name)}</span>
                <span class="share"><span style="width:${(r.total / maxTop) * 100}%;background:${c.color}"></span></span>
              </span>
              <span class="row-end-text">${escapeHtml(money(r.total))}<small>${t.spent ? Math.round((r.total / t.spent) * 100) : 0}%</small></span>
            </a>`;
          }).join("")}
        </div>
      </section>` : ""}

    ${recent.length ? `
      <section class="block">
        <div class="block-head"><h2>Recent</h2><a href="#/activity" class="link">See all</a></div>
        <div class="group">${recent.map((x) => txnRow(x, { cats, accts, showDate: true })).join("")}</div>
      </section>` : ""}
  `;

  main.querySelector("[data-dismiss-install]")?.addEventListener("click", async () => {
    await store.setLocal("installHintDismissed", true);
    renderHome(main);
  });
}
