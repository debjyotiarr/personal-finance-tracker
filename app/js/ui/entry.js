// The add / edit transaction sheet.

import { store } from "../store.js";
import { evaluateAmount, rateSnapshot, convertAmount, formatMoney } from "../money.js";
import { findNearDuplicates, noteMemory, categoryUsage } from "../analytics.js";
import { FREQUENCIES } from "../recurring.js";
import { escapeHtml, todayISO, addDays, normalizeText, uid } from "../util.js";
import { CATEGORY_COLORS, EMOJI_CHOICES } from "../defaults.js";
import { openSheet, closeSheet, toast, confirmSheet, icon } from "./dom.js";
import { catBadge, accountLabel, moneyIn, reportCurrency } from "./view.js";

const TYPE_LABEL = { expense: "Expense", income: "Income", transfer: "Transfer" };
const VISIBLE_CATS = 9; // two rows of five on a phone, with "more" or "new"

export function openEntry({ id = null, type = "expense", preset = null } = {}) {
  const existing = id ? store.find("transactions", id) : null;
  const base = existing || preset || {};
  const accounts = store.accounts.filter((a) => !a.archived);
  const lastAccount = store.local.lastAccountId && accounts.some((a) => a.id === store.local.lastAccountId) ? store.local.lastAccountId : "";

  const draft = {
    id: existing?.id || null,
    type: base.type || type,
    amountText: base.amount ? String(base.amount) : "",
    currency: base.currency || store.local.lastCurrency || store.prefs.defaultCurrency || "INR",
    categoryId: base.categoryId || "",
    accountId: base.accountId ?? lastAccount,
    toAccountId: base.toAccountId || "",
    note: base.note || "",
    date: existing?.date || preset?.date || todayISO(),
    repeat: "none",
    recurringId: existing?.recurringId || null,
    flag: existing?.flag || "none",
    categoryTouched: Boolean(base.categoryId),
    showAllCats: false,
    confirmDuplicate: false,
    newCategoryOpen: false,
    error: ""
  };

  const memory = noteMemory(store.transactions);
  const usage = categoryUsage(store.transactions, todayISO());

  openSheet((el) => {
    const render = (focusAmount = false) => {
      // Keep whatever was typed before re-rendering.
      const typedAmount = el.querySelector("[name=amount]");
      if (typedAmount) draft.amountText = typedAmount.value;
      const typedNote = el.querySelector("[name=note]");
      if (typedNote) draft.note = typedNote.value;
      const scroll = el.scrollTop;
      el.innerHTML = template(draft, { existing, accounts, usage, memory });
      el.scrollTop = scroll;
      wire(el, render);
      if (focusAmount) {
        const input = el.querySelector("[name=amount]");
        input?.focus({ preventScroll: true });
      }
    };
    render(!existing);
  });

  function wire(el, render) {
    const form = el.querySelector("form");
    const amount = el.querySelector("[name=amount]");
    const hint = el.querySelector("[data-amount-hint]");

    const updateHint = () => {
      draft.amountText = amount.value;
      hint.innerHTML = amountHint(draft);
    };
    amount.addEventListener("input", updateHint);

    el.querySelectorAll("[data-op]").forEach((btn) => btn.addEventListener("click", () => {
      amount.value = `${amount.value.replace(/[+\-*/\s]+$/, "")}${btn.dataset.op}`;
      updateHint();
      amount.focus();
    }));

    el.querySelector("[data-close]").addEventListener("click", closeSheet);

    el.querySelectorAll("[data-type]").forEach((btn) => btn.addEventListener("click", () => {
      if (draft.type === btn.dataset.type) return;
      draft.amountText = amount.value;
      draft.type = btn.dataset.type;
      const cat = store.find("categories", draft.categoryId);
      if (cat && cat.kind !== draft.type) { draft.categoryId = ""; draft.categoryTouched = false; }
      draft.error = "";
      render();
    }));

    el.querySelector("[name=currency]").addEventListener("change", (e) => {
      draft.currency = e.target.value;
      updateHint();
    });

    el.querySelectorAll("[data-cat]").forEach((btn) => btn.addEventListener("click", () => {
      draft.amountText = amount.value;
      draft.categoryId = btn.dataset.cat;
      draft.categoryTouched = true;
      draft.error = "";
      draft.confirmDuplicate = false;
      el.querySelectorAll("[data-cat]").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
      el.querySelector("[data-error]").textContent = "";
    }));

    el.querySelector("[data-more-cats]")?.addEventListener("click", () => {
      draft.amountText = amount.value;
      draft.showAllCats = true;
      render();
    });

    el.querySelector("[data-new-cat]")?.addEventListener("click", () => {
      draft.amountText = amount.value;
      draft.newCategoryOpen = true;
      render();
      el.querySelector("[name=newCatName]")?.focus();
    });

    el.querySelector("[data-new-cat-cancel]")?.addEventListener("click", () => {
      draft.newCategoryOpen = false;
      render();
    });

    el.querySelector("[data-new-cat-save]")?.addEventListener("click", async () => {
      const name = el.querySelector("[name=newCatName]").value.trim();
      const emoji = el.querySelector("[name=newCatEmoji]").value;
      if (!name) { el.querySelector("[name=newCatName]").focus(); return; }
      draft.amountText = amount.value;
      draft.note = el.querySelector("[name=note]").value;
      const all = store.categories;
      const cat = await store.save("categories", {
        id: uid("cat"), name: name.slice(0, 40), emoji, kind: draft.type,
        color: CATEGORY_COLORS[all.length % CATEGORY_COLORS.length], budget: null, order: all.length, archived: false
      });
      draft.categoryId = cat.id;
      draft.categoryTouched = true;
      draft.newCategoryOpen = false;
      draft.showAllCats = true;
      render();
    });

    const note = el.querySelector("[name=note]");
    note.addEventListener("change", () => {
      draft.note = note.value;
      const remembered = memory.get(normalizeText(note.value));
      if (remembered && !draft.categoryTouched && remembered.type === draft.type && remembered.categoryId) {
        draft.amountText = amount.value;
        draft.categoryId = remembered.categoryId;
        if (remembered.accountId && !draft.accountId) draft.accountId = remembered.accountId;
        render();
      }
    });

    el.querySelectorAll("[data-day]").forEach((btn) => btn.addEventListener("click", () => {
      draft.amountText = amount.value;
      draft.note = note.value;
      draft.date = btn.dataset.day;
      draft.confirmDuplicate = false;
      render();
    }));
    el.querySelector("[name=date]").addEventListener("change", (e) => {
      if (!e.target.value) return;
      draft.amountText = amount.value;
      draft.note = note.value;
      draft.date = e.target.value;
      render();
    });

    for (const field of ["accountId", "toAccountId", "repeat"]) {
      el.querySelector(`[name=${field}]`)?.addEventListener("change", (e) => { draft[field] = e.target.value; });
    }

    el.querySelector("[data-not-dup]")?.addEventListener("click", async () => {
      const saved = await store.save("transactions", { ...existing, flag: "resolved" });
      draft.flag = saved.flag;
      toast("Marked as not a duplicate");
      render();
    });

    el.querySelector("[data-delete]")?.addEventListener("click", async () => {
      const snapshot = { ...existing };
      await store.remove("transactions", existing.id);
      closeSheet();
      toast("Deleted", { action: "Undo", onAction: () => store.save("transactions", snapshot) });
    });

    el.querySelector("[data-duplicate]")?.addEventListener("click", () => {
      const copy = { ...existing, id: null, date: todayISO(), recurringId: null, flag: "none" };
      closeSheet();
      setTimeout(() => openEntry({ preset: copy }), 200);
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      draft.amountText = amount.value;
      draft.note = note.value;
      await submit(el, render);
    });
  }

  async function submit(el, render) {
    const amount = evaluateAmount(draft.amountText);
    const fail = (msg) => {
      draft.error = msg;
      el.querySelector("[data-error]").textContent = msg;
    };
    if (!Number.isFinite(amount) || amount <= 0) return fail("Enter an amount above zero.");
    if (draft.type !== "transfer" && !draft.categoryId) return fail("Pick a category.");
    if (draft.type === "transfer") {
      if (!draft.accountId || !draft.toAccountId) return fail("Choose the account the money left and the one it went to.");
      if (draft.accountId === draft.toAccountId) return fail("Choose two different accounts.");
    }

    const currency = store.currenciesByCode.get(draft.currency);
    const keepRates = existing && existing.currency === draft.currency;
    const rates = keepRates ? { rateUSD: existing.rateUSD, rateINR: existing.rateINR } : rateSnapshot(currency);
    const record = {
      ...(existing || {}),
      id: existing?.id || uid("txn"),
      type: draft.type,
      date: draft.date,
      amount,
      currency: draft.currency,
      ...rates,
      categoryId: draft.type === "transfer" ? null : draft.categoryId,
      accountId: draft.accountId || null,
      toAccountId: draft.type === "transfer" ? draft.toAccountId : null,
      note: draft.note.trim().slice(0, 80),
      recurringId: existing?.recurringId || null,
      flag: existing?.flag || "none"
    };

    if (!draft.confirmDuplicate) {
      const dups = findNearDuplicates(record, store.transactions, store.prefs.nearDupTolerance ?? 10);
      if (dups.length) {
        draft.confirmDuplicate = true;
        render();
        return;
      }
    }

    if (!existing && draft.repeat !== "none") {
      const rule = await store.save("recurring", {
        id: uid("rule"),
        type: record.type,
        amount: record.amount,
        currency: record.currency,
        rateUSD: record.rateUSD,
        rateINR: record.rateINR,
        categoryId: record.categoryId,
        accountId: record.accountId,
        toAccountId: record.toAccountId,
        note: record.note,
        frequency: draft.repeat,
        startDate: record.date,
        endDate: null,
        paused: false
      });
      const n = await store.generateRecurring();
      store.emit();
      closeSheet();
      toast(`Repeats ${FREQUENCIES[rule.frequency].toLowerCase()}${n > 1 ? `, ${n} entries added up to today` : ""}`);
    } else {
      const saved = await store.save("transactions", record);
      closeSheet();
      if (existing) {
        toast("Saved");
      } else {
        const cat = store.find("categories", saved.categoryId);
        toast(`Added ${moneyIn(saved.amount, saved.currency)}${cat ? ` to ${cat.name}` : ""}`, {
          action: "Undo",
          onAction: () => store.remove("transactions", saved.id)
        });
      }
    }

    if (record.accountId) await store.setLocal("lastAccountId", record.accountId);
    await store.setLocal("lastCurrency", record.currency);
  }
}

function amountHint(draft) {
  const value = evaluateAmount(draft.amountText);
  const parts = [];
  const isExpr = /[+\-*/]/.test(draft.amountText.replace(/^-/, ""));
  if (isExpr && Number.isFinite(value)) parts.push(`= ${moneyIn(value, draft.currency)}`);
  const rc = reportCurrency();
  if (draft.currency !== rc && Number.isFinite(value) && value > 0) {
    parts.push(`≈ ${formatMoney(convertAmount(value, draft.currency, rc, store.currenciesByCode), rc)}`);
  }
  return escapeHtml(parts.join("   "));
}

function template(draft, { existing, accounts, usage, memory }) {
  const today = todayISO();
  const yesterday = addDays(today, -1);
  const isOtherDay = draft.date !== today && draft.date !== yesterday;
  const title = existing ? `Edit ${TYPE_LABEL[draft.type].toLowerCase()}` : `New ${TYPE_LABEL[draft.type].toLowerCase()}`;
  const currencies = store.currencies;
  const dups = draft.confirmDuplicate
    ? findNearDuplicates({ ...draft, amount: evaluateAmount(draft.amountText), categoryId: draft.categoryId || null }, store.transactions, store.prefs.nearDupTolerance ?? 10)
    : [];

  const notes = [...memory.values()]
    .filter((m) => m.type === draft.type)
    .sort((a, b) => b.count - a.count)
    .slice(0, 60);

  return `
    <form class="entry" novalidate>
      <header class="sheet-head">
        <h2 id="sheet-title">${escapeHtml(title)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Close">${icon("close")}</button>
      </header>

      <div class="seg" role="group" aria-label="Type">
        ${Object.entries(TYPE_LABEL).map(([k, label]) => `<button type="button" class="seg-btn seg-${k}" data-type="${k}" aria-pressed="${draft.type === k}">${label}</button>`).join("")}
      </div>

      <div class="amount-row amount-${draft.type}">
        <select name="currency" class="currency-pick" aria-label="Currency">
          ${currencies.map((c) => `<option value="${escapeHtml(c.code)}" ${c.code === draft.currency ? "selected" : ""}>${escapeHtml(c.symbol || c.code)} ${escapeHtml(c.code)}</option>`).join("")}
        </select>
        <input name="amount" class="amount-input" inputmode="decimal" autocomplete="off" enterkeyhint="done"
          placeholder="0" value="${escapeHtml(draft.amountText)}" aria-label="Amount" />
      </div>
      <div class="amount-meta">
        <span data-amount-hint class="muted">${amountHint(draft)}</span>
        <span class="ops" aria-label="Add up amounts">
          <button type="button" data-op="+" aria-label="Plus">+</button>
          <button type="button" data-op="-" aria-label="Minus">−</button>
          <button type="button" data-op="*" aria-label="Times">×</button>
        </span>
      </div>

      ${draft.type === "transfer" ? transferFields(draft, accounts) : categoryGrid(draft, usage)}

      <label class="field">
        <span class="field-label">Note</span>
        <input name="note" list="note-suggestions" maxlength="80" autocomplete="off" placeholder="${draft.type === "income" ? "Where it came from" : "What it was for"}" value="${escapeHtml(draft.note)}" />
        <datalist id="note-suggestions">${notes.map((n) => `<option value="${escapeHtml(n.note)}"></option>`).join("")}</datalist>
      </label>

      <div class="pill-row" role="group" aria-label="Date">
        <button type="button" class="pill" data-day="${today}" aria-pressed="${draft.date === today}">Today</button>
        <button type="button" class="pill" data-day="${yesterday}" aria-pressed="${draft.date === yesterday}">Yesterday</button>
        <label class="pill pill-date" aria-pressed="${isOtherDay}">
          <span>${isOtherDay ? escapeHtml(new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: draft.date.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric" }).format(new Date(`${draft.date}T12:00`))) : "Other day"}</span>
          <input type="date" name="date" value="${draft.date}" max="${addDays(today, 366)}" aria-label="Pick a date" />
        </label>
      </div>

      <div class="field-grid">
        ${draft.type === "transfer" ? "" : `
        <label class="field">
          <span class="field-label">Account</span>
          <select name="accountId">
            <option value="">No account</option>
            ${accounts.map((a) => `<option value="${a.id}" ${a.id === draft.accountId ? "selected" : ""}>${escapeHtml(accountLabel(a))}</option>`).join("")}
          </select>
        </label>`}
        ${existing ? "" : `
        <label class="field">
          <span class="field-label">Repeat</span>
          <select name="repeat">
            <option value="none">Doesn't repeat</option>
            ${Object.entries(FREQUENCIES).map(([k, v]) => `<option value="${k}" ${draft.repeat === k ? "selected" : ""}>${v}</option>`).join("")}
          </select>
        </label>`}
      </div>

      ${existing?.recurringId ? `<p class="note-line">${icon("repeat")} Part of a repeating series. Changes here apply to this entry only. Manage the series in Settings › Repeating.</p>` : ""}

      ${draft.flag === "near_duplicate" ? `
        <div class="callout callout-warn">
          <span>This was flagged as a possible duplicate.</span>
          <button type="button" class="btn btn-quiet btn-small" data-not-dup>Not a duplicate</button>
        </div>` : ""}

      ${dups.length ? `
        <div class="callout callout-warn" role="alert">
          <span>You already have ${dups.length === 1 ? "a similar entry" : `${dups.length} similar entries`} on this day:
          ${dups.slice(0, 2).map((d) => `${escapeHtml(moneyIn(d.amount, d.currency))}${d.note ? ` (${escapeHtml(d.note)})` : ""}`).join(", ")}.</span>
        </div>` : ""}

      <p class="form-error" data-error role="alert">${escapeHtml(draft.error)}</p>

      <footer class="sheet-foot">
        ${existing ? `
          <button type="button" class="btn btn-quiet btn-danger-text" data-delete>Delete</button>
          <button type="button" class="btn btn-quiet" data-duplicate>Copy as new</button>` : "<span></span>"}
        <button type="submit" class="btn btn-primary btn-wide">${dups.length ? "Save anyway" : existing ? "Save" : "Add"}</button>
      </footer>
    </form>`;
}

function categoryGrid(draft, usage) {
  const cats = store.categories.filter((c) => c.kind === draft.type && !c.archived);
  const sorted = [...cats].sort((a, b) => (usage.get(b.id) || 0) - (usage.get(a.id) || 0) || (a.order ?? 0) - (b.order ?? 0));
  let visible = draft.showAllCats ? sorted : sorted.slice(0, VISIBLE_CATS);
  if (draft.categoryId && !visible.some((c) => c.id === draft.categoryId)) {
    const selected = sorted.find((c) => c.id === draft.categoryId);
    if (selected) visible = [selected, ...visible.slice(0, VISIBLE_CATS - 1)];
  }
  const hidden = sorted.length - visible.length;

  return `
    <div class="cat-grid" role="group" aria-label="Category">
      ${visible.map((c) => `
        <button type="button" class="cat-choice" data-cat="${c.id}" aria-pressed="${c.id === draft.categoryId}" style="--c:${c.color}">
          ${catBadge(c, "lg")}
          <span>${escapeHtml(c.name)}</span>
        </button>`).join("")}
      ${hidden > 0
        ? `<button type="button" class="cat-choice cat-more" data-more-cats><span class="cat-badge lg">⋯</span><span>${hidden} more</span></button>`
        : `<button type="button" class="cat-choice cat-more" data-new-cat><span class="cat-badge lg">＋</span><span>New</span></button>`}
    </div>
    ${draft.newCategoryOpen ? `
      <div class="inline-new">
        <select name="newCatEmoji" aria-label="Icon">${EMOJI_CHOICES.map((e) => `<option>${e}</option>`).join("")}</select>
        <input name="newCatName" maxlength="40" placeholder="Category name" autocomplete="off" />
        <button type="button" class="btn btn-quiet btn-small" data-new-cat-cancel>Cancel</button>
        <button type="button" class="btn btn-primary btn-small" data-new-cat-save>Add</button>
      </div>` : ""}`;
}

function transferFields(draft, accounts) {
  if (accounts.length < 2) {
    return `<p class="callout">Transfers move money between two of your accounts. Add a second account in Settings › Accounts first.</p>`;
  }
  const options = (selected) => `<option value="">Choose…</option>${accounts.map((a) => `<option value="${a.id}" ${a.id === selected ? "selected" : ""}>${escapeHtml(accountLabel(a))}</option>`).join("")}`;
  return `
    <div class="transfer-row">
      <label class="field"><span class="field-label">From</span><select name="accountId">${options(draft.accountId)}</select></label>
      <span class="transfer-arrow" aria-hidden="true">${icon("arrow")}</span>
      <label class="field"><span class="field-label">To</span><select name="toAccountId">${options(draft.toAccountId)}</select></label>
    </div>
    <p class="muted small">Transfers don't count as spending or income.</p>`;
}

export { confirmSheet };
