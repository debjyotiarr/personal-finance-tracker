// Settings and its sub-pages.

import { store } from "../store.js";
import { COMMON_CURRENCIES, REPORT_CURRENCIES, formatMoney } from "../money.js";
import { categoryAverages, suggestBudget } from "../analytics.js";
import { FREQUENCIES, nextOccurrence } from "../recurring.js";
import { CATEGORY_COLORS, EMOJI_CHOICES } from "../defaults.js";
import { countChangesSince } from "../sync.js";
import { escapeHtml, uid, todayISO, monthKey, addDays } from "../util.js";
import { openSheet, closeSheet, toast, confirmSheet, icon } from "./dom.js";
import { catBadge, accountLabel, moneyIn, relativeTime, dayLabel } from "./view.js";
import { renderSync } from "./syncui.js";
import { renderLockSettings } from "./lock.js";

const VERSION = "2.0.0";

export function renderSettings(main, sub) {
  if (sub === "categories") return renderCategories(main);
  if (sub === "accounts") return renderAccounts(main);
  if (sub === "currencies") return renderCurrencies(main);
  if (sub === "repeating") return renderRepeating(main);
  if (sub === "sync") return renderSync(main);
  if (sub === "lock") return renderLockSettings(main);
  if (sub === "help") return renderHelp(main);
  return renderIndex(main);
}

function subHead(title, action = "") {
  return `
    <header class="page-head">
      <div>
        <a class="back" href="#/settings">${icon("back")} Settings</a>
        <h1>${escapeHtml(title)}</h1>
      </div>
      ${action}
    </header>`;
}

function navRow(href, label, detail = "", emoji = "") {
  return `<a class="row row-nav" href="${href}">${emoji ? `<span class="row-icon" aria-hidden="true">${emoji}</span>` : ""}<span class="row-main"><span class="row-title">${escapeHtml(label)}</span></span><span class="row-detail">${escapeHtml(detail)}</span>${icon("chevron", "icon chev")}</a>`;
}

function renderIndex(main) {
  const prefs = store.prefs;
  const changes = countChangesSince(store.data, store.local.lastSyncAt || 0);
  const budget = prefs.monthlyBudget;

  main.innerHTML = `
    <header class="page-head"><div><h1>Settings</h1></div></header>

    <section class="block">
      <h2 class="block-title">Your data</h2>
      <div class="group">
        ${navRow("#/settings/sync", "Sync & backup", store.local.lastSyncAt ? `${relativeTime(store.local.lastSyncAt)}${changes ? `, ${changes} new` : ""}` : "Not set up", "🔄")}
      </div>
      <p class="group-note">Your data is stored on this ${escapeHtml(store.local.deviceName || "device")} only. Sync through a file in iCloud Drive or Google Drive to share it between your iPhone and Mac.</p>
    </section>

    <section class="block">
      <h2 class="block-title">Set up</h2>
      <div class="group">
        ${navRow("#/settings/categories", "Categories & budgets", `${store.categories.filter((c) => !c.archived).length}`, "🗂️")}
        ${navRow("#/settings/accounts", "Accounts", `${store.accounts.filter((a) => !a.archived).length}`, "💳")}
        ${navRow("#/settings/currencies", "Currencies & rates", store.currencies.map((c) => c.code).join(", "), "💱")}
        ${navRow("#/settings/repeating", "Repeating entries", `${store.recurring.length || "None"}`, "🔁")}
      </div>
    </section>

    <section class="block">
      <h2 class="block-title">Preferences</h2>
      <div class="group">
        <label class="row row-field">
          <span class="row-main"><span class="row-title">Monthly budget</span><span class="row-sub">For all spending. Leave empty for none.</span></span>
          <span class="inline-money">
            <select name="budgetCurrency" aria-label="Budget currency">${REPORT_CURRENCIES.map((c) => `<option ${c === (budget?.currency || prefs.reportCurrency) ? "selected" : ""}>${c}</option>`).join("")}</select>
            <input name="monthlyBudget" inputmode="decimal" placeholder="None" value="${budget?.amount || ""}" aria-label="Monthly budget amount" />
          </span>
        </label>
        <label class="row row-field">
          <span class="row-main"><span class="row-title">Currency for new entries</span></span>
          <select name="defaultCurrency">${store.currencies.map((c) => `<option value="${c.code}" ${c.code === prefs.defaultCurrency ? "selected" : ""}>${escapeHtml(c.code)}</option>`).join("")}</select>
        </label>
        <label class="row row-field">
          <span class="row-main"><span class="row-title">Show totals in</span><span class="row-sub">Everything is converted with your rates.</span></span>
          <select name="reportCurrency">${REPORT_CURRENCIES.map((c) => `<option ${c === prefs.reportCurrency ? "selected" : ""}>${c}</option>`).join("")}</select>
        </label>
        <label class="row row-field">
          <span class="row-main"><span class="row-title">Duplicate warning</span><span class="row-sub">Warn when a same-day entry in the same category is within this amount.</span></span>
          <input name="nearDupTolerance" inputmode="decimal" class="input-short" value="${prefs.nearDupTolerance ?? 10}" aria-label="Duplicate tolerance" />
        </label>
      </div>
    </section>

    <section class="block">
      <h2 class="block-title">Privacy</h2>
      <div class="group">
        ${navRow("#/settings/lock", "App lock", store.local.pinHash ? "On" : "Off", "🔒")}
      </div>
    </section>

    <section class="block">
      <h2 class="block-title">About</h2>
      <div class="group">
        ${navRow("#/settings/help", "Install on iPhone and Mac", "", "📲")}
        <label class="row row-field">
          <span class="row-main"><span class="row-title">This device's name</span><span class="row-sub">Shown in sync files.</span></span>
          <input name="deviceName" class="input-mid" maxlength="30" value="${escapeHtml(store.local.deviceName || "")}" />
        </label>
        <button type="button" class="row row-danger" data-erase><span class="row-main"><span class="row-title">Erase data on this device</span></span></button>
      </div>
      <p class="group-note">Finance Tracker ${VERSION}. Works offline. Nothing is sent to a server.</p>
    </section>
  `;

  const commitBudget = () => {
    const raw = main.querySelector("[name=monthlyBudget]").value.replace(/,/g, "").trim();
    const amount = Number(raw);
    const currency = main.querySelector("[name=budgetCurrency]").value;
    store.savePrefs({ monthlyBudget: raw && amount > 0 ? { amount, currency } : null });
  };
  main.querySelector("[name=monthlyBudget]").addEventListener("change", commitBudget);
  main.querySelector("[name=budgetCurrency]").addEventListener("change", commitBudget);
  main.querySelector("[name=defaultCurrency]").addEventListener("change", (e) => store.savePrefs({ defaultCurrency: e.target.value }));
  main.querySelector("[name=reportCurrency]").addEventListener("change", (e) => store.savePrefs({ reportCurrency: e.target.value }));
  main.querySelector("[name=nearDupTolerance]").addEventListener("change", (e) => store.savePrefs({ nearDupTolerance: Math.max(0, Number(e.target.value) || 0) }));
  main.querySelector("[name=deviceName]").addEventListener("change", (e) => store.setLocal("deviceName", e.target.value.trim() || "This device"));
  main.querySelector("[data-erase]").addEventListener("click", async () => {
    const ok = await confirmSheet({
      title: "Erase all data on this device?",
      body: "Transactions, categories and settings on this device are deleted. A sync file you saved elsewhere is not affected, so save one first if you want to keep a copy.",
      confirm: "Erase",
      danger: true
    });
    if (!ok) return;
    await store.eraseAll();
    location.hash = "#/home";
    location.reload();
  });
}

// ---------- Categories ----------

function renderCategories(main) {
  const cur = store.prefs.reportCurrency;
  const counts = usageCounts("categoryId");
  const section = (kind, title) => {
    const list = store.categories.filter((c) => c.kind === kind);
    return `
      <section class="block">
        <h2 class="block-title">${title}</h2>
        <div class="group">
          ${list.map((c) => `
            <button type="button" class="row" data-edit="${c.id}">
              ${catBadge(c)}
              <span class="row-main">
                <span class="row-title">${escapeHtml(c.name)}${c.archived ? ' <span class="muted small">hidden</span>' : ""}</span>
                <span class="row-sub">${counts.get(c.id) || 0} entr${counts.get(c.id) === 1 ? "y" : "ies"}</span>
              </span>
              <span class="row-detail">${c.budget?.amount ? `${escapeHtml(moneyIn(c.budget.amount, c.budget.currency))} / month` : ""}</span>
              ${icon("chevron", "icon chev")}
            </button>`).join("")}
        </div>
      </section>`;
  };
  main.innerHTML = `
    ${subHead("Categories & budgets", `<button type="button" class="btn btn-primary btn-small" data-add>${icon("plus")} Add</button>`)}
    ${section("expense", "Spending")}
    ${section("income", "Income")}
    <p class="group-note">Set a monthly budget on any spending category to see progress on Home and warnings in Insights. Totals are shown in ${escapeHtml(cur)}.</p>
  `;
  main.querySelector("[data-add]").addEventListener("click", () => editCategory(null));
  main.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => editCategory(b.dataset.edit)));
}

function editCategory(id) {
  const existing = id ? store.find("categories", id) : null;
  const all = store.categories;
  const draft = existing
    ? { ...existing, budget: existing.budget ? { ...existing.budget } : null }
    : { id: null, name: "", emoji: "📦", color: CATEGORY_COLORS[all.length % CATEGORY_COLORS.length], kind: "expense", budget: null, archived: false, order: all.length };
  const cur = store.prefs.reportCurrency;
  const { averages, monthsWithHistory } = categoryAverages(store.transactions, cur, monthKey(todayISO()), 3);
  const suggestion = existing && monthsWithHistory ? suggestBudget(averages, existing.id) : null;
  const used = existing ? usageCounts("categoryId").get(existing.id) || 0 : 0;

  openSheet((el) => {
    const render = () => {
      el.innerHTML = `
        <form class="entry" novalidate>
          <header class="sheet-head"><h2 id="sheet-title">${existing ? "Edit category" : "New category"}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icon("close")}</button></header>
          <div class="cat-preview">${catBadge(draft, "xl")}<input name="name" maxlength="40" placeholder="Name" value="${escapeHtml(draft.name)}" aria-label="Name" /></div>
          <div class="seg" role="group" aria-label="Kind">
            <button type="button" class="seg-btn" data-kind="expense" aria-pressed="${draft.kind === "expense"}">Spending</button>
            <button type="button" class="seg-btn" data-kind="income" aria-pressed="${draft.kind === "income"}">Income</button>
          </div>
          <fieldset class="picker"><legend class="field-label">Icon</legend>
            <div class="emoji-grid">${EMOJI_CHOICES.map((e) => `<button type="button" data-emoji="${e}" aria-pressed="${e === draft.emoji}">${e}</button>`).join("")}</div>
            <label class="field field-inline"><span class="field-label">Or type any emoji</span><input name="emoji" maxlength="4" class="input-short" value="${escapeHtml(draft.emoji)}" /></label>
          </fieldset>
          <fieldset class="picker"><legend class="field-label">Colour</legend>
            <div class="swatches">${CATEGORY_COLORS.map((c) => `<button type="button" data-color="${c}" style="--c:${c}" aria-pressed="${c === draft.color}" aria-label="Colour ${c}"></button>`).join("")}</div>
          </fieldset>
          ${draft.kind === "expense" ? `
          <label class="field"><span class="field-label">Monthly budget</span>
            <span class="inline-money">
              <select name="budgetCurrency">${REPORT_CURRENCIES.map((c) => `<option ${c === (draft.budget?.currency || cur) ? "selected" : ""}>${c}</option>`).join("")}</select>
              <input name="budget" inputmode="decimal" placeholder="No budget" value="${draft.budget?.amount || ""}" />
            </span>
          </label>
          ${suggestion ? `<p class="note-line">Your recent average is about ${escapeHtml(formatMoney(averages.get(existing.id), cur))} a month. <button type="button" class="link-btn" data-suggest>Use ${escapeHtml(formatMoney(suggestion, cur))}</button></p>` : ""}` : ""}
          <label class="check"><input type="checkbox" name="archived" ${draft.archived ? "checked" : ""} /> Hide from the add screen (past entries keep it)</label>
          <p class="form-error" data-error></p>
          <footer class="sheet-foot">
            ${existing ? `<button type="button" class="btn btn-quiet btn-danger-text" data-delete>${used ? "Delete…" : "Delete"}</button>` : "<span></span>"}
            <button type="submit" class="btn btn-primary btn-wide">${existing ? "Save" : "Add category"}</button>
          </footer>
        </form>`;
      wire();
    };
    const capture = () => {
      draft.name = el.querySelector("[name=name]").value;
      const b = el.querySelector("[name=budget]");
      if (b) {
        const amount = Number(b.value.replace(/,/g, ""));
        draft.budget = b.value.trim() && amount > 0 ? { amount, currency: el.querySelector("[name=budgetCurrency]").value } : null;
      }
      draft.archived = el.querySelector("[name=archived]").checked;
      draft.emoji = el.querySelector("[name=emoji]").value.trim() || draft.emoji;
    };
    const wire = () => {
      el.querySelector("[data-close]").addEventListener("click", closeSheet);
      el.querySelectorAll("[data-kind]").forEach((b) => b.addEventListener("click", () => { capture(); draft.kind = b.dataset.kind; if (draft.kind === "income") draft.budget = null; render(); }));
      el.querySelectorAll("[data-emoji]").forEach((b) => b.addEventListener("click", () => { capture(); draft.emoji = b.dataset.emoji; render(); }));
      el.querySelectorAll("[data-color]").forEach((b) => b.addEventListener("click", () => { capture(); draft.color = b.dataset.color; render(); }));
      el.querySelector("[data-suggest]")?.addEventListener("click", () => { capture(); draft.budget = { amount: suggestion, currency: cur }; render(); });
      el.querySelector("[data-delete]")?.addEventListener("click", async () => {
        if (used) {
          const ok = await confirmSheet({ title: `Delete ${existing.name}?`, body: `${used} entr${used === 1 ? "y uses" : "ies use"} this category. They'll show as Uncategorised. To keep them as they are, hide the category instead.`, confirm: "Delete", danger: true });
          if (!ok) return;
        } else {
          closeSheet();
        }
        await store.remove("categories", existing.id);
        toast("Category deleted");
      });
      el.querySelector("form").addEventListener("submit", async (e) => {
        e.preventDefault();
        capture();
        if (!draft.name.trim()) { el.querySelector("[data-error]").textContent = "Give the category a name."; return; }
        if (!existing && store.categories.filter((c) => !c.archived).length >= 60) { el.querySelector("[data-error]").textContent = "That's a lot of categories. Hide some you don't use first."; return; }
        await store.save("categories", { ...draft, id: draft.id || uid("cat"), name: draft.name.trim() });
        closeSheet();
        toast(existing ? "Saved" : "Category added");
      });
    };
    render();
  });
}

// ---------- Accounts ----------

const ACCOUNT_KINDS = { bank: "Bank account", card: "Credit card", cash: "Cash", wallet: "Wallet / UPI", other: "Other" };
const ACCOUNT_EMOJI = { bank: "🏦", card: "💳", cash: "💵", wallet: "📱", other: "👛" };

function renderAccounts(main) {
  const counts = usageCounts("accountId", "toAccountId");
  main.innerHTML = `
    ${subHead("Accounts", `<button type="button" class="btn btn-primary btn-small" data-add>${icon("plus")} Add</button>`)}
    <div class="group">
      ${store.accounts.map((a) => `
        <button type="button" class="row" data-edit="${a.id}">
          <span class="row-icon" aria-hidden="true">${ACCOUNT_EMOJI[a.kind] || "👛"}</span>
          <span class="row-main"><span class="row-title">${escapeHtml(accountLabel(a))}${a.archived ? ' <span class="muted small">hidden</span>' : ""}</span><span class="row-sub">${ACCOUNT_KINDS[a.kind] || "Other"}, ${counts.get(a.id) || 0} entries</span></span>
          ${icon("chevron", "icon chev")}
        </button>`).join("") || `<p class="muted pad">No accounts yet.</p>`}
    </div>
    <p class="group-note">Accounts are optional. They help you see which card or bank a payment came from, and let you log transfers between them.</p>
  `;
  main.querySelector("[data-add]").addEventListener("click", () => editAccount(null));
  main.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => editAccount(b.dataset.edit)));
}

function editAccount(id) {
  const existing = id ? store.find("accounts", id) : null;
  const used = existing ? usageCounts("accountId", "toAccountId").get(existing.id) || 0 : 0;
  openSheet((el) => {
    el.innerHTML = `
      <form class="entry" novalidate>
        <header class="sheet-head"><h2 id="sheet-title">${existing ? "Edit account" : "New account"}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icon("close")}</button></header>
        <label class="field"><span class="field-label">Name</span><input name="name" maxlength="40" placeholder="HDFC savings" value="${escapeHtml(existing?.name || "")}" /></label>
        <div class="field-grid">
          <label class="field"><span class="field-label">Type</span><select name="kind">${Object.entries(ACCOUNT_KINDS).map(([k, v]) => `<option value="${k}" ${k === (existing?.kind || "bank") ? "selected" : ""}>${v}</option>`).join("")}</select></label>
          <label class="field"><span class="field-label">Last 4 digits</span><input name="last4" inputmode="numeric" maxlength="4" placeholder="Optional" value="${escapeHtml(existing?.last4 || "")}" /></label>
        </div>
        ${existing ? `<label class="check"><input type="checkbox" name="archived" ${existing.archived ? "checked" : ""} /> Hide from the add screen</label>` : ""}
        <p class="form-error" data-error></p>
        <footer class="sheet-foot">
          ${existing ? `<button type="button" class="btn btn-quiet btn-danger-text" data-delete>Delete</button>` : "<span></span>"}
          <button type="submit" class="btn btn-primary btn-wide">${existing ? "Save" : "Add account"}</button>
        </footer>
      </form>`;
    el.querySelector("[data-close]").addEventListener("click", closeSheet);
    el.querySelector("[data-delete]")?.addEventListener("click", async () => {
      if (used) {
        el.querySelector("[data-error]").textContent = `${used} entr${used === 1 ? "y uses" : "ies use"} this account. Hide it instead, or change those entries first.`;
        return;
      }
      closeSheet();
      await store.remove("accounts", existing.id);
      toast("Account deleted");
    });
    el.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = el.querySelector("[name=name]").value.trim();
      const last4 = el.querySelector("[name=last4]").value.trim();
      const err = el.querySelector("[data-error]");
      if (!name) { err.textContent = "Give the account a name."; return; }
      if (last4 && !/^\d{4}$/.test(last4)) { err.textContent = "Last 4 digits should be exactly four numbers, or left empty."; return; }
      const clash = store.accounts.find((a) => a.id !== existing?.id && a.name.toLowerCase() === name.toLowerCase() && (a.last4 || "") === last4);
      if (clash) { err.textContent = "You already have an account with this name and number."; return; }
      await store.save("accounts", {
        ...(existing || { order: store.accounts.length }),
        id: existing?.id || uid("acc"),
        name,
        last4,
        kind: el.querySelector("[name=kind]").value,
        archived: el.querySelector("[name=archived]")?.checked || false
      });
      closeSheet();
      toast(existing ? "Saved" : "Account added");
    });
    if (!existing) el.querySelector("[name=name]").focus();
  });
}

// ---------- Currencies ----------

function renderCurrencies(main) {
  const counts = new Map();
  for (const t of store.transactions) counts.set(t.currency, (counts.get(t.currency) || 0) + 1);
  main.innerHTML = `
    ${subHead("Currencies & rates", `<button type="button" class="btn btn-primary btn-small" data-add>${icon("plus")} Add</button>`)}
    <div class="group">
      ${store.currencies.map((c) => `
        <button type="button" class="row" data-edit="${escapeHtml(c.code)}">
          <span class="row-icon currency-symbol" aria-hidden="true">${escapeHtml(c.symbol || c.code)}</span>
          <span class="row-main">
            <span class="row-title">${escapeHtml(c.code)} <span class="muted small">${escapeHtml(c.name || "")}</span></span>
            <span class="row-sub">${c.code === "USD" ? "" : `1 ${escapeHtml(c.code)} = ${rateText(c.toUSD)} USD`}${c.code !== "USD" && c.code !== "INR" ? ", " : ""}${c.code === "INR" ? "" : `1 ${escapeHtml(c.code)} = ${rateText(c.toINR)} INR`}</span>
          </span>
          <span class="row-detail">${counts.get(c.code) || ""}</span>
          ${icon("chevron", "icon chev")}
        </button>`).join("")}
    </div>
    <p class="group-note">Set how much each currency is worth in US dollars and in rupees. They're set separately, so you can use whatever rates you actually got. Each entry remembers the rates from when you added it; when you change a rate you can choose to update past entries too.</p>
  `;
  main.querySelector("[data-add]").addEventListener("click", () => editCurrency(null));
  main.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => editCurrency(b.dataset.edit)));
}

function rateText(n) {
  const v = Number(n) || 0;
  if (!v) return "?";
  return v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(4).replace(/0+$/, "").replace(/\.$/, "") : v.toPrecision(4);
}

function editCurrency(code) {
  const existing = code ? store.find("currencies", code) : null;
  const usedBy = existing ? store.transactions.filter((t) => t.currency === existing.code) : [];
  const builtin = existing && (existing.code === "INR" || existing.code === "USD");
  const available = COMMON_CURRENCIES.filter(([c]) => !store.find("currencies", c));

  openSheet((el) => {
    el.innerHTML = `
      <form class="entry" novalidate>
        <header class="sheet-head"><h2 id="sheet-title">${existing ? `${escapeHtml(existing.code)} rates` : "Add a currency"}</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icon("close")}</button></header>
        ${existing ? "" : `
          <label class="field"><span class="field-label">Currency</span>
            <select name="preset">
              ${available.map(([c, n]) => `<option value="${c}">${c}, ${escapeHtml(n)}</option>`).join("")}
              <option value="__custom">Another currency…</option>
            </select>
          </label>`}
        <div class="field-grid field-grid-3">
          <label class="field"><span class="field-label">Code</span><input name="code" maxlength="5" value="${escapeHtml(existing?.code || available[0]?.[0] || "")}" ${existing ? "disabled" : ""} /></label>
          <label class="field"><span class="field-label">Symbol</span><input name="symbol" maxlength="4" value="${escapeHtml(existing?.symbol || available[0]?.[2] || "")}" /></label>
          <label class="field"><span class="field-label">Name</span><input name="name" maxlength="40" value="${escapeHtml(existing?.name || available[0]?.[1] || "")}" /></label>
        </div>
        <div class="rate-box">
          <label class="rate-line"><span>1 <b data-code>${escapeHtml(existing?.code || available[0]?.[0] || "")}</b> =</span><input name="toUSD" inputmode="decimal" value="${existing?.toUSD ?? ""}" ${existing?.code === "USD" ? "disabled" : ""} placeholder="0.00" /><span>USD</span></label>
          <label class="rate-line"><span>1 <b data-code>${escapeHtml(existing?.code || available[0]?.[0] || "")}</b> =</span><input name="toINR" inputmode="decimal" value="${existing?.toINR ?? ""}" ${existing?.code === "INR" ? "disabled" : ""} placeholder="0.00" /><span>INR</span></label>
        </div>
        ${usedBy.length ? `<label class="check"><input type="checkbox" name="applyPast" /> Also update the ${usedBy.length} existing ${escapeHtml(existing.code)} entr${usedBy.length === 1 ? "y" : "ies"} to these rates</label>` : ""}
        ${existing ? `<p class="muted small">${(existing.updatedAt || 0) < 1e11 ? "These are starting rates. Check them against the rates you actually get." : `Rates last changed ${relativeTime(existing.updatedAt)}.`}</p>` : ""}
        <p class="form-error" data-error></p>
        <footer class="sheet-foot">
          ${existing && !builtin ? `<button type="button" class="btn btn-quiet btn-danger-text" data-delete>Delete</button>` : "<span></span>"}
          <button type="submit" class="btn btn-primary btn-wide">${existing ? "Save rates" : "Add currency"}</button>
        </footer>
      </form>`;

    el.querySelector("[data-close]").addEventListener("click", closeSheet);
    const preset = el.querySelector("[name=preset]");
    preset?.addEventListener("change", () => {
      const found = COMMON_CURRENCIES.find(([c]) => c === preset.value);
      el.querySelector("[name=code]").value = found?.[0] || "";
      el.querySelector("[name=symbol]").value = found?.[2] || "";
      el.querySelector("[name=name]").value = found?.[1] || "";
      el.querySelectorAll("[data-code]").forEach((n) => { n.textContent = found?.[0] || "?"; });
      if (!found) el.querySelector("[name=code]").focus();
    });
    el.querySelector("[name=code]").addEventListener("input", (e) => {
      el.querySelectorAll("[data-code]").forEach((n) => { n.textContent = e.target.value.toUpperCase() || "?"; });
    });
    el.querySelector("[data-delete]")?.addEventListener("click", async () => {
      if (usedBy.length) { el.querySelector("[data-error]").textContent = `${usedBy.length} entries are in ${existing.code}, so it can't be deleted.`; return; }
      closeSheet();
      await store.remove("currencies", existing.code);
      toast(`${existing.code} removed`);
    });
    el.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = el.querySelector("[data-error]");
      const codeVal = (existing?.code || el.querySelector("[name=code]").value).trim().toUpperCase();
      const toUSD = codeVal === "USD" ? 1 : Number(el.querySelector("[name=toUSD]").value.replace(/,/g, ""));
      const toINR = codeVal === "INR" ? 1 : Number(el.querySelector("[name=toINR]").value.replace(/,/g, ""));
      if (!/^[A-Z]{2,5}$/.test(codeVal)) { err.textContent = "Use a 3-letter code like EUR."; return; }
      if (!existing && store.find("currencies", codeVal)) { err.textContent = `${codeVal} is already in your list.`; return; }
      if (!(toUSD > 0) || !(toINR > 0)) { err.textContent = "Enter both rates as numbers above zero."; return; }
      const saved = await store.save("currencies", {
        ...(existing || {}),
        id: codeVal,
        code: codeVal,
        symbol: el.querySelector("[name=symbol]").value.trim() || codeVal,
        name: el.querySelector("[name=name]").value.trim(),
        toUSD,
        toINR
      });
      if (el.querySelector("[name=applyPast]")?.checked) {
        await store.saveMany("transactions", usedBy.map((t) => ({ ...t, rateUSD: saved.toUSD, rateINR: saved.toINR })));
        // Keep repeating entries in step too.
        const rules = store.recurring.filter((r) => r.currency === codeVal);
        if (rules.length) await store.saveMany("recurring", rules.map((r) => ({ ...r, rateUSD: saved.toUSD, rateINR: saved.toINR })));
      }
      closeSheet();
      toast(existing ? "Rates saved" : `${codeVal} added`);
    });
  });
}

// ---------- Repeating ----------

function renderRepeating(main) {
  const today = todayISO();
  const rules = [...store.recurring].sort((a, b) => (a.note || "").localeCompare(b.note || ""));
  main.innerHTML = `
    ${subHead("Repeating entries")}
    ${rules.length ? `<div class="group">
      ${rules.map((r) => {
        const cat = store.find("categories", r.categoryId);
        const next = r.paused ? null : nextOccurrence(r, today);
        return `
          <button type="button" class="row" data-edit="${r.id}">
            ${catBadge(cat || { emoji: "⇄", color: "#7C8590" })}
            <span class="row-main">
              <span class="row-title">${escapeHtml(r.note || cat?.name || "Transfer")}</span>
              <span class="row-sub">${FREQUENCIES[r.frequency]}${r.paused ? ", paused" : next ? `, next ${escapeHtml(dayLabel(next))}` : ", ended"}</span>
            </span>
            <span class="row-detail">${escapeHtml(moneyIn(r.amount, r.currency))}</span>
            ${icon("chevron", "icon chev")}
          </button>`;
      }).join("")}
    </div>` : `<div class="empty"><p class="empty-title">No repeating entries</p><p class="muted">When you add a transaction, choose “Repeat” to have rent, salary or subscriptions logged automatically on the right day.</p></div>`}
    <p class="group-note">Entries are created on their due date the next time you open the app. Changes here apply to future entries; ones already logged stay as they are.</p>
  `;
  main.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => editRule(b.dataset.edit)));
}

function editRule(id) {
  const rule = store.find("recurring", id);
  if (!rule) return;
  const cats = store.categories.filter((c) => c.kind === rule.type);
  openSheet((el) => {
    el.innerHTML = `
      <form class="entry" novalidate>
        <header class="sheet-head"><h2 id="sheet-title">Repeating entry</h2><button type="button" class="icon-btn" data-close aria-label="Close">${icon("close")}</button></header>
        <div class="field-grid">
          <label class="field"><span class="field-label">Amount (${escapeHtml(rule.currency)})</span><input name="amount" inputmode="decimal" value="${rule.amount}" /></label>
          <label class="field"><span class="field-label">How often</span><select name="frequency">${Object.entries(FREQUENCIES).map(([k, v]) => `<option value="${k}" ${k === rule.frequency ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        </div>
        <label class="field"><span class="field-label">Note</span><input name="note" maxlength="80" value="${escapeHtml(rule.note || "")}" /></label>
        ${rule.type !== "transfer" ? `<label class="field"><span class="field-label">Category</span><select name="categoryId">${cats.map((c) => `<option value="${c.id}" ${c.id === rule.categoryId ? "selected" : ""}>${escapeHtml(`${c.emoji} ${c.name}`)}</option>`).join("")}</select></label>` : ""}
        <div class="field-grid">
          <label class="field"><span class="field-label">Started</span><input type="date" name="startDate" value="${rule.startDate}" disabled /></label>
          <label class="field"><span class="field-label">Ends</span><input type="date" name="endDate" value="${rule.endDate || ""}" min="${rule.startDate}" /></label>
        </div>
        <label class="check"><input type="checkbox" name="paused" ${rule.paused ? "checked" : ""} /> Paused (no new entries)</label>
        <p class="form-error" data-error></p>
        <footer class="sheet-foot">
          <button type="button" class="btn btn-quiet btn-danger-text" data-delete>Stop repeating</button>
          <button type="submit" class="btn btn-primary btn-wide">Save</button>
        </footer>
      </form>`;
    el.querySelector("[data-close]").addEventListener("click", closeSheet);
    el.querySelector("[data-delete]").addEventListener("click", async () => {
      closeSheet();
      await store.remove("recurring", rule.id);
      toast("Stopped. Past entries are kept.");
    });
    el.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const amount = Number(el.querySelector("[name=amount]").value.replace(/,/g, ""));
      if (!(amount > 0)) { el.querySelector("[data-error]").textContent = "Enter an amount above zero."; return; }
      // Changing the schedule, or resuming after a pause, starts a fresh series
      // from tomorrow so past dates are not back-filled or doubled up.
      const frequency = el.querySelector("[name=frequency]").value;
      const restart = frequency !== rule.frequency;
      const endDate = el.querySelector("[name=endDate]").value || null;
      const wasPaused = rule.paused;
      const paused = el.querySelector("[name=paused]").checked;
      const startDate = restart || (wasPaused && !paused) ? addDays(todayISO(), 1) : rule.startDate;
      await store.save("recurring", {
        ...rule,
        id: restart || (wasPaused && !paused) ? uid("rule") : rule.id,
        amount,
        frequency,
        note: el.querySelector("[name=note]").value.trim(),
        categoryId: el.querySelector("[name=categoryId]")?.value || rule.categoryId,
        endDate,
        paused,
        startDate
      });
      if (restart || (wasPaused && !paused)) await store.remove("recurring", rule.id);
      await store.generateRecurring();
      store.emit();
      closeSheet();
      toast("Saved");
    });
  });
}

// ---------- Help ----------

function renderHelp(main) {
  main.innerHTML = `
    ${subHead("Install on iPhone and Mac")}
    <section class="prose">
      <h2>iPhone</h2>
      <ol>
        <li>Open this page in <strong>Safari</strong>.</li>
        <li>Tap the <strong>Share</strong> button, then <strong>Add to Home Screen</strong>.</li>
        <li>Open Finance Tracker from its new icon. It runs full screen and works offline.</li>
      </ol>
      <p>Use the Home Screen app rather than a Safari tab: Safari may clear storage for websites you haven't visited for a while, but Home Screen apps keep their data.</p>
      <h2>Mac</h2>
      <ol>
        <li>In <strong>Safari</strong> (macOS Sonoma or later), choose <strong>File › Add to Dock</strong>.</li>
        <li>Or in <strong>Chrome</strong>, click the install icon in the address bar. Chrome also supports one-click sync to a linked file.</li>
      </ol>
      <h2>Keeping both in step</h2>
      <p>Each device keeps its own copy. Go to <a href="#/settings/sync">Sync &amp; backup</a> on either device whenever you like; at the end of the month is enough. Merging never loses entries: if the same entry was changed on both devices, the most recent change wins.</p>
      <h2>Shortcuts on Mac</h2>
      <p><kbd>N</kbd> add a transaction, <kbd>/</kbd> search, <kbd>1</kbd>–<kbd>4</kbd> switch screens, <kbd>Esc</kbd> close.</p>
    </section>
  `;
}

function usageCounts(...fields) {
  const counts = new Map();
  for (const t of store.transactions) for (const f of fields) if (t[f]) counts.set(t[f], (counts.get(t[f]) || 0) + 1);
  return counts;
}
