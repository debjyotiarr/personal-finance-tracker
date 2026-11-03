// Activity: every transaction, searchable and filterable, grouped by day.

import { store } from "../store.js";
import { totals } from "../analytics.js";
import { convertTxn } from "../money.js";
import { monthKey, shiftMonth, todayISO, escapeHtml, normalizeText, toCsv } from "../util.js";
import { money, categoryMap, accountMap, txnRow, dayLabel, monthLabel, accountLabel, emptyState, catFor, reportCurrency } from "./view.js";
import { icon } from "./dom.js";

const PAGE = 300;
let filters = null;
let limit = PAGE;

export function setActivityFilters(params) {
  filters = {
    month: params.get("month") || (params.has("q") ? "all" : monthKey(todayISO())),
    type: params.get("type") || "all",
    cat: params.get("cat") || "",
    acct: params.get("acct") || "",
    q: params.get("q") || ""
  };
  limit = PAGE;
}

function filtered() {
  const q = normalizeText(filters.q);
  return store.transactions
    .filter((t) => filters.month === "all" || monthKey(t.date) === filters.month)
    .filter((t) => filters.type === "all" || t.type === filters.type)
    .filter((t) => !filters.cat || (t.categoryId || "uncategorised") === filters.cat || (filters.cat === "transfer" && t.type === "transfer"))
    .filter((t) => !filters.acct || t.accountId === filters.acct || t.toAccountId === filters.acct)
    .filter((t) => !q || normalizeText(`${t.note} ${store.find("categories", t.categoryId)?.name || ""}`).includes(q) || String(t.amount).startsWith(filters.q.trim()))
    .sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1));
}

export function renderActivity(main) {
  if (!filters) setActivityFilters(new URLSearchParams());
  const cur = reportCurrency();
  const cats = categoryMap();
  const accts = accountMap();
  const rows = filtered();
  const t = totals(rows, cur);
  const shown = rows.slice(0, limit);

  const groups = [];
  for (const txn of shown) {
    let g = groups.at(-1);
    if (!g || g.date !== txn.date) { g = { date: txn.date, items: [], net: 0 }; groups.push(g); }
    g.items.push(txn);
    if (txn.type === "expense") g.net -= convertTxn(txn, cur);
    if (txn.type === "income") g.net += convertTxn(txn, cur);
  }

  const months = monthOptions();
  const activeFilterCount = [filters.type !== "all", filters.cat, filters.acct].filter(Boolean).length;

  main.innerHTML = `
    <header class="page-head">
      <div><h1>Activity</h1></div>
      <button type="button" class="btn btn-quiet btn-small" data-export ${rows.length ? "" : "disabled"}>${icon("download")} CSV</button>
    </header>

    <div class="search">
      ${icon("search")}
      <input type="search" name="q" placeholder="Search notes, categories, amounts" value="${escapeHtml(filters.q)}" autocomplete="off" enterkeyhint="search" />
    </div>

    <div class="filter-bar">
      <div class="month-step">
        <button type="button" class="icon-btn" data-step="-1" aria-label="Previous month" ${filters.month === "all" ? "disabled" : ""}>${icon("back")}</button>
        <select name="month" aria-label="Month">
          <option value="all" ${filters.month === "all" ? "selected" : ""}>All time</option>
          ${months.map((m) => `<option value="${m}" ${m === filters.month ? "selected" : ""}>${escapeHtml(monthLabel(m))}</option>`).join("")}
        </select>
        <button type="button" class="icon-btn" data-step="1" aria-label="Next month" ${filters.month === "all" || filters.month >= monthKey(todayISO()) ? "disabled" : ""}>${icon("chevron")}</button>
      </div>
      <div class="filter-selects">
        <select name="type" aria-label="Type" class="${filters.type !== "all" ? "is-set" : ""}">
          <option value="all">All types</option>
          <option value="expense" ${filters.type === "expense" ? "selected" : ""}>Expenses</option>
          <option value="income" ${filters.type === "income" ? "selected" : ""}>Income</option>
          <option value="transfer" ${filters.type === "transfer" ? "selected" : ""}>Transfers</option>
        </select>
        <select name="cat" aria-label="Category" class="${filters.cat ? "is-set" : ""}">
          <option value="">All categories</option>
          ${store.categories.map((c) => `<option value="${c.id}" ${c.id === filters.cat ? "selected" : ""}>${escapeHtml(`${c.emoji} ${c.name}`)}</option>`).join("")}
          <option value="uncategorised" ${filters.cat === "uncategorised" ? "selected" : ""}>Uncategorised</option>
        </select>
        <select name="acct" aria-label="Account" class="${filters.acct ? "is-set" : ""}">
          <option value="">All accounts</option>
          ${store.accounts.map((a) => `<option value="${a.id}" ${a.id === filters.acct ? "selected" : ""}>${escapeHtml(accountLabel(a))}</option>`).join("")}
        </select>
        ${activeFilterCount ? `<button type="button" class="btn btn-quiet btn-small" data-clear>Clear</button>` : ""}
      </div>
    </div>

    ${rows.length ? `
      <p class="summary-line">
        <span>${rows.length} entr${rows.length === 1 ? "y" : "ies"}</span>
        <span class="amt-expense">${escapeHtml(money(t.spent))} out</span>
        <span class="amt-income">${escapeHtml(money(t.income))} in</span>
      </p>
      ${groups.map((g) => `
        <section class="day">
          <h2 class="day-head"><span>${escapeHtml(dayLabel(g.date))}</span><span class="muted">${g.net ? escapeHtml(money(g.net, { sign: true })) : ""}</span></h2>
          <div class="group">${g.items.map((x) => txnRow(x, { cats, accts })).join("")}</div>
        </section>`).join("")}
      ${rows.length > limit ? `<button type="button" class="btn btn-quiet btn-block" data-more>Show ${Math.min(PAGE, rows.length - limit)} more</button>` : ""}
    ` : store.transactions.length
      ? emptyState("Nothing matches", filters.q ? `No entries match “${filters.q}” with these filters.` : "No entries for this month with these filters.", activeFilterCount || filters.q ? "Clear filters" : "", "clear-filters")
      : emptyState("No transactions yet", "Everything you log shows up here, newest first.", "Add a transaction")}
  `;

  const go = () => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v && !(k === "type" && v === "all")) params.set(k, v);
    history.replaceState(null, "", `#/activity?${params}`);
    renderActivity(main);
  };

  const search = main.querySelector("[name=q]");
  let timer;
  search.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const wasEmpty = !filters.q;
      filters.q = search.value;
      if (wasEmpty && filters.q) filters.month = "all";
      const pos = search.selectionStart;
      go();
      const again = main.querySelector("[name=q]");
      again.focus();
      again.setSelectionRange(pos, pos);
    }, 180);
  });

  for (const name of ["month", "type", "cat", "acct"]) {
    main.querySelector(`[name=${name}]`).addEventListener("change", (e) => { filters[name] = e.target.value; limit = PAGE; go(); });
  }
  main.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => {
    filters.month = shiftMonth(filters.month, Number(b.dataset.step));
    go();
  }));
  const clear = () => { filters.type = "all"; filters.cat = ""; filters.acct = ""; filters.q = ""; go(); };
  main.querySelector("[data-clear]")?.addEventListener("click", clear);
  main.querySelector("[data-action=clear-filters]")?.addEventListener("click", (e) => { e.stopPropagation(); clear(); });
  main.querySelector("[data-more]")?.addEventListener("click", () => { limit += PAGE; renderActivity(main); });
  main.querySelector("[data-export]")?.addEventListener("click", () => exportCsv(rows));
}

function monthOptions() {
  const now = monthKey(todayISO());
  const earliest = store.transactions.reduce((min, t) => (t.date < min ? t.date : min), todayISO());
  const out = [];
  let m = now;
  const stop = monthKey(earliest);
  while (m >= stop && out.length < 240) { out.push(m); m = shiftMonth(m, -1); }
  if (filters.month !== "all" && !out.includes(filters.month)) out.push(filters.month);
  return out;
}

function exportCsv(rows) {
  const cats = categoryMap();
  const accts = accountMap();
  const header = ["Date", "Type", "Amount", "Currency", "Amount (INR)", "Amount (USD)", "Category", "Account", "To account", "Note", "Repeating"];
  const lines = rows.map((t) => [
    t.date,
    t.type,
    t.amount,
    t.currency,
    convertTxn(t, "INR").toFixed(2),
    convertTxn(t, "USD").toFixed(2),
    catFor(t, cats).name,
    accountLabel(accts.get(t.accountId)),
    accountLabel(accts.get(t.toAccountId)),
    t.note || "",
    t.recurringId ? "yes" : ""
  ]);
  const blob = new Blob([toCsv([header, ...lines])], { type: "text/csv" });
  const name = `finances-${filters.month === "all" ? "all" : filters.month}.csv`;
  downloadBlob(blob, name);
}

export async function downloadBlob(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  const isTouch = matchMedia("(pointer: coarse)").matches;
  if (isTouch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return true;
    } catch (error) {
      if (error.name === "AbortError") return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}
