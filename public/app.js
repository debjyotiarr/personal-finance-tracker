const state = {
  bootstrap: null,
  currentView: "dashboard",
  categories: [],
  accounts: [],
  transactions: [],
  summary: null,
  filters: {
    startDate: offsetDate(-30),
    endDate: today(),
    categoryId: "",
    subcategoryId: "",
    txnType: "all",
    accountId: "",
    query: ""
  },
  editingTransactionId: null,
  transactionDraft: defaultTransactionDraft(),
  categoryDraft: { name: "", icon: "shapes", parentId: "" },
  accountDraft: { name: "", last4: "" }
};

const navItems = [
  { id: "dashboard", label: "Dashboard" },
  { id: "categories", label: "Categories" },
  { id: "accounts", label: "Accounts" },
  { id: "imports", label: "Imports" },
  { id: "reports", label: "Reports" }
];

const app = {
  nav: document.querySelector("#nav"),
  authView: document.querySelector("#auth-view"),
  dashboardView: document.querySelector("#dashboard-view"),
  categoriesView: document.querySelector("#categories-view"),
  accountsView: document.querySelector("#accounts-view"),
  importsView: document.querySelector("#imports-view"),
  reportsView: document.querySelector("#reports-view"),
  userPill: document.querySelector("#user-pill"),
  logoutButton: document.querySelector("#logout-button")
};

app.logoutButton.addEventListener("click", logout);

renderNav();
bootstrap();

async function bootstrap() {
  try {
    state.bootstrap = await api("/api/bootstrap");
    renderShell();

    if (state.bootstrap.user) {
      await loadAppData();
    }
  } catch (error) {
    renderFatal(error.message);
  }
}

async function loadAppData() {
  const [categoriesPayload, accountsPayload, transactionsPayload] = await Promise.all([
    api("/api/categories"),
    api("/api/accounts"),
    api(transactionUrl())
  ]);

  state.categories = categoriesPayload.categories;
  state.accounts = accountsPayload.accounts;
  state.transactions = transactionsPayload.transactions;
  state.summary = transactionsPayload.summary;
  renderShell();
}

function renderShell() {
  const user = state.bootstrap?.user;
  app.userPill.textContent = user ? `Signed in as ${user.username}` : "";
  app.userPill.classList.toggle("hidden", !user);
  app.logoutButton.classList.toggle("hidden", !user);

  renderNav();

  if (!state.bootstrap?.hasUser || !user) {
    renderAuth();
    return;
  }

  setVisible(app.authView, false);
  renderDashboard();
  renderCategories();
  renderAccounts();
  renderImports();
  renderReports();

  const visible = {
    dashboard: app.dashboardView,
    categories: app.categoriesView,
    accounts: app.accountsView,
    imports: app.importsView,
    reports: app.reportsView
  };

  Object.entries(visible).forEach(([id, node]) => setVisible(node, state.currentView === id));
}

function renderNav() {
  const isAuthed = Boolean(state.bootstrap?.user);
  app.nav.innerHTML = "";

  for (const item of navItems) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = item.label;
    button.disabled = !isAuthed;
    button.className = item.id === state.currentView ? "active" : "";
    button.addEventListener("click", () => {
      state.currentView = item.id;
      renderShell();
    });
    app.nav.appendChild(button);
  }
}

function renderAuth() {
  setVisible(app.authView, true);
  setVisible(app.dashboardView, false);
  setVisible(app.categoriesView, false);
  setVisible(app.accountsView, false);
  setVisible(app.importsView, false);
  setVisible(app.reportsView, false);

  const template = document.querySelector("#auth-template");
  const fragment = template.content.cloneNode(true);
  const title = fragment.querySelector("#auth-title");
  const copy = fragment.querySelector("#auth-copy");
  const submit = fragment.querySelector("#auth-submit");
  const form = fragment.querySelector("#auth-form");
  const errorNode = fragment.querySelector("#auth-error");

  const mode = state.bootstrap?.hasUser ? "login" : "setup";
  title.textContent = mode === "setup" ? "Create your local account" : "Log into your tracker";
  copy.textContent = mode === "setup"
    ? "Your data stays on this machine. Create the one local account for the app."
    : "Log in to access your transactions, categories, and reports.";
  submit.textContent = mode === "setup" ? "Create account" : "Log in";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorNode.textContent = "";
    const formData = new FormData(form);
    const payload = {
      username: formData.get("username"),
      password: formData.get("password")
    };

    try {
      const result = await api(mode === "setup" ? "/api/setup" : "/api/login", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      state.bootstrap = {
        hasUser: true,
        user: result.user
      };
      await loadAppData();
    } catch (error) {
      errorNode.textContent = error.message;
    }
  });

  app.authView.innerHTML = "";
  app.authView.appendChild(fragment);
}

function renderDashboard() {
  app.dashboardView.innerHTML = `
    <div class="panel-header">
      <div>
        <p class="eyebrow">Transactions</p>
        <h2>Dashboard</h2>
        <p class="muted">Track debits, credits, and transfers with local-only storage.</p>
      </div>
      <div class="button-row">
        <button type="button" class="secondary" id="download-csv">Download CSV</button>
      </div>
    </div>
    <div class="stats">
      ${renderStatCard("Debits", formatCurrency(state.summary?.debit || 0))}
      ${renderStatCard("Credits", formatCurrency(state.summary?.credit || 0))}
      ${renderStatCard("Transfers", formatCurrency(state.summary?.transfer || 0))}
      ${renderStatCard("Rows", String(state.summary?.count || 0))}
    </div>
    <div class="split">
      <section class="report-card">
        <h3>Filters</h3>
        <form id="filters-form" class="stack">
          <div class="grid-4">
            <label>Start date<input type="date" name="startDate" value="${state.filters.startDate}" /></label>
            <label>End date<input type="date" name="endDate" value="${state.filters.endDate}" /></label>
            <label>Type${renderTypeSelect(state.filters.txnType, "txnType")}</label>
            <label>Account${renderAccountSelect(state.filters.accountId, "accountId")}</label>
          </div>
          <div class="grid-4">
            <label>Category${renderCategorySelect(state.filters.categoryId, "categoryId", true)}</label>
            <label>Sub-category${renderSubcategorySelect(state.filters.categoryId, state.filters.subcategoryId, "subcategoryId", true)}</label>
            <label>Search<input name="query" value="${escapeHtml(state.filters.query)}" placeholder="merchant or note" /></label>
            <div class="button-row" style="align-items:end;">
              <button type="submit" class="primary">Apply filters</button>
              <button type="button" class="ghost" id="reset-filters">Reset</button>
            </div>
          </div>
        </form>
      </section>
      <section class="report-card">
        <h3>${state.editingTransactionId ? "Edit transaction" : "Add transaction"}</h3>
        <form id="transaction-form" class="stack">
          <div class="grid-2">
            <label>Type${renderTypeSelect(state.transactionDraft.txnType, "txnType", false)}</label>
            <label>Date<input type="date" name="txnDate" value="${state.transactionDraft.txnDate}" required /></label>
          </div>
          <div class="grid-2">
            <label>Amount<input type="number" name="amount" min="0.01" step="0.01" value="${state.transactionDraft.amount}" required /></label>
            <label>Account${renderAccountSelect(state.transactionDraft.accountId, "accountId")}</label>
          </div>
          <div class="grid-2">
            <label>Category${renderCategorySelect(state.transactionDraft.categoryId, "categoryId")}</label>
            <label>Sub-category${renderSubcategorySelect(state.transactionDraft.categoryId, state.transactionDraft.subcategoryId, "subcategoryId")}</label>
          </div>
          <div class="grid-2">
            <label>Description<input name="description" maxlength="120" value="${escapeHtml(state.transactionDraft.description)}" placeholder="Short merchant-style description" /></label>
            <label>Note<input name="note" maxlength="70" value="${escapeHtml(state.transactionDraft.note)}" placeholder="Optional note, max 70 chars" /></label>
          </div>
          <div class="button-row">
            <button type="submit" class="primary">${state.editingTransactionId ? "Save changes" : "Add transaction"}</button>
            ${state.editingTransactionId ? '<button type="button" class="ghost" id="cancel-edit">Cancel</button>' : ""}
          </div>
          <p class="inline-error" id="transaction-error"></p>
        </form>
      </section>
    </div>
    <section class="report-card" style="margin-top:18px;">
      <h3>Transactions</h3>
      ${renderTransactionsTable()}
    </section>
  `;

  app.dashboardView.querySelector("#download-csv").addEventListener("click", () => {
    window.location.href = `/api/export.csv?${new URLSearchParams(state.filters).toString()}`;
  });

  app.dashboardView.querySelector("#filters-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    state.filters = {
      startDate: String(data.get("startDate")),
      endDate: String(data.get("endDate")),
      txnType: String(data.get("txnType")),
      accountId: String(data.get("accountId")),
      categoryId: String(data.get("categoryId")),
      subcategoryId: String(data.get("subcategoryId")),
      query: String(data.get("query"))
    };
    await refreshTransactions();
  });

  app.dashboardView.querySelector("#reset-filters").addEventListener("click", async () => {
    state.filters = {
      startDate: offsetDate(-30),
      endDate: today(),
      categoryId: "",
      subcategoryId: "",
      txnType: "all",
      accountId: "",
      query: ""
    };
    await refreshTransactions();
  });

  app.dashboardView.querySelector("#transaction-form").addEventListener("submit", saveTransaction);
  app.dashboardView.querySelectorAll("[data-edit-transaction]").forEach((button) => {
    button.addEventListener("click", () => startEditTransaction(Number(button.dataset.editTransaction)));
  });
  app.dashboardView.querySelectorAll("[data-resolve-flag]").forEach((button) => {
    button.addEventListener("click", () => resolveFlag(Number(button.dataset.resolveFlag)));
  });

  const cancelEdit = app.dashboardView.querySelector("#cancel-edit");
  if (cancelEdit) {
    cancelEdit.addEventListener("click", () => {
      state.editingTransactionId = null;
      state.transactionDraft = defaultTransactionDraft();
      renderDashboard();
    });
  }
}

function renderCategories() {
  app.categoriesView.innerHTML = `
    <div class="panel-header">
      <div>
        <p class="eyebrow">Categories</p>
        <h2>Manage categories</h2>
        <p class="muted">Up to 50 top-level categories, each with a logo key for now.</p>
      </div>
    </div>
    <div class="split">
      <section class="report-card">
        <h3>Add category or sub-category</h3>
        <form id="category-form" class="stack">
          <div class="grid-3">
            <label>Name<input name="name" maxlength="40" value="${escapeHtml(state.categoryDraft.name)}" required /></label>
            <label>Icon key<input name="icon" maxlength="40" value="${escapeHtml(state.categoryDraft.icon)}" placeholder="shapes" required /></label>
            <label>Parent category${renderCategorySelect(state.categoryDraft.parentId, "parentId", true)}</label>
          </div>
          <div class="button-row">
            <button type="submit" class="primary">Save category</button>
          </div>
          <p class="inline-error" id="category-error"></p>
        </form>
      </section>
      <section class="report-card">
        <h3>Starter icon note</h3>
        <p class="muted">
          This first version stores a simple icon key such as <code>fork-knife</code> or <code>wallet</code>.
          The visual icon picker and image uploads up to 300 KB will be added in the next pass without changing
          the category model.
        </p>
      </section>
    </div>
    <section class="report-card" style="margin-top:18px;">
      <h3>Current categories</h3>
      <div class="category-card-grid">
        ${state.categories.map(renderCategoryCard).join("")}
      </div>
    </section>
  `;

  app.categoriesView.querySelector("#category-form").addEventListener("submit", saveCategory);
}

function renderAccounts() {
  app.accountsView.innerHTML = `
    <div class="panel-header">
      <div>
        <p class="eyebrow">Accounts</p>
        <h2>Manage accounts</h2>
        <p class="muted">Use friendly labels with optional last 4 digits.</p>
      </div>
    </div>
    <div class="split">
      <section class="report-card">
        <h3>Add account</h3>
        <form id="account-form" class="stack">
          <div class="grid-2">
            <label>Name<input name="name" maxlength="40" value="${escapeHtml(state.accountDraft.name)}" required /></label>
            <label>Last 4 digits<input name="last4" maxlength="4" inputmode="numeric" value="${escapeHtml(state.accountDraft.last4)}" placeholder="Optional" /></label>
          </div>
          <div class="button-row">
            <button type="submit" class="primary">Save account</button>
          </div>
          <p class="inline-error" id="account-error"></p>
        </form>
      </section>
      <section class="report-card">
        <h3>Saved accounts</h3>
        ${
          state.accounts.length
            ? `<table class="simple-table">
                <thead><tr><th>Name</th><th>Last 4</th></tr></thead>
                <tbody>${state.accounts.map((account) => `<tr><td>${escapeHtml(account.name)}</td><td>${escapeHtml(account.last4 || "")}</td></tr>`).join("")}</tbody>
              </table>`
            : `<div class="empty-state">No accounts yet. Add one for better tracking across bank statements and cash entries.</div>`
        }
      </section>
    </div>
  `;

  app.accountsView.querySelector("#account-form").addEventListener("submit", saveAccount);
}

function renderImports() {
  app.importsView.innerHTML = `
    <div class="panel-header">
      <div>
        <p class="eyebrow">Imports</p>
        <h2>Statement import groundwork</h2>
        <p class="muted">The first functional slice focuses on local auth, manual entry, and reporting. Import review is scaffolded next.</p>
      </div>
    </div>
    <section class="report-card">
      <h3>Planned import flow</h3>
      <ol>
        <li>Upload bank CSV, bank PDF, or Google Pay export.</li>
        <li>Parse rows into a normalized review table.</li>
        <li>Suggest type, category, account, and description locally.</li>
        <li>Warn on duplicates and near-duplicates.</li>
        <li>Approve only the rows you want to save.</li>
      </ol>
      <p class="muted">
        The schema and dashboard rules are already set up to support duplicate flags and editable imported data.
      </p>
    </section>
  `;
}

function renderReports() {
  app.reportsView.innerHTML = `
    <div class="panel-header">
      <div>
        <p class="eyebrow">Reports</p>
        <h2>Exports and summaries</h2>
        <p class="muted">CSV export is live in this first version. Formatted PDF reports are next.</p>
      </div>
    </div>
    <section class="report-card">
      <h3>Current export support</h3>
      <ul>
        <li>Download the currently filtered dashboard as CSV.</li>
        <li>Summary cards show debits, credits, transfers, and row count.</li>
        <li>PDF report generation will build on the same filtered dataset.</li>
      </ul>
      <div class="button-row">
        <button type="button" class="primary" id="reports-csv">Download current CSV</button>
      </div>
    </section>
  `;

  app.reportsView.querySelector("#reports-csv").addEventListener("click", () => {
    window.location.href = `/api/export.csv?${new URLSearchParams(state.filters).toString()}`;
  });
}

function renderTransactionsTable() {
  if (!state.transactions.length) {
    return `<div class="empty-state">No transactions match the current filters yet.</div>`;
  }

  return `
    <table class="transactions-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Type</th>
          <th>Amount</th>
          <th>Category</th>
          <th>Account</th>
          <th>Description</th>
          <th>Note</th>
          <th>Flag</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${state.transactions.map((txn) => `
          <tr>
            <td>${escapeHtml(txn.txnDate)}</td>
            <td><span class="type-pill ${txn.txnType}">${escapeHtml(txn.txnType)}</span></td>
            <td>${formatCurrency(txn.amount)}</td>
            <td>
              ${escapeHtml(txn.categoryName || "")}
              ${txn.subcategoryName ? `<div class="muted">${escapeHtml(txn.subcategoryName)}</div>` : ""}
            </td>
            <td>${escapeHtml(txn.accountDisplay || "")}</td>
            <td>${escapeHtml(txn.description || "")}</td>
            <td>${escapeHtml(txn.note || "")}</td>
            <td>
              <span class="flag-pill ${txn.duplicateFlag}">${escapeHtml(txn.duplicateFlag.replace("_", " "))}</span>
              ${txn.duplicateReference ? `<div class="muted">${escapeHtml(txn.duplicateReference)}</div>` : ""}
            </td>
            <td>
              <div class="button-row">
                <button type="button" class="ghost" data-edit-transaction="${txn.id}">Edit</button>
                ${txn.duplicateFlag === "near_duplicate" ? `<button type="button" class="secondary" data-resolve-flag="${txn.id}">De-flag</button>` : ""}
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderCategoryCard(category) {
  return `
    <article class="category-card">
      <strong>${escapeHtml(category.name)}</strong>
      <div class="muted">Icon key: ${escapeHtml(category.icon)}</div>
      ${
        category.subcategories.length
          ? `<ul>${category.subcategories.map((sub) => `<li>${escapeHtml(sub.name)}</li>`).join("")}</ul>`
          : `<p class="muted">No sub-categories yet.</p>`
      }
    </article>
  `;
}

function renderTypeSelect(selected, name, includeAll = false) {
  const options = [
    ...(includeAll ? [['all', 'All types']] : []),
    ['debit', 'Debit'],
    ['credit', 'Credit'],
    ['transfer', 'Transfer']
  ];
  return `<select name="${name}">${options.map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`).join("")}</select>`;
}

function renderCategorySelect(selected, name, includeAll = false) {
  const options = [
    ...(includeAll ? [['', 'All categories']] : [['', 'Select category']]),
    ...state.categories.map((category) => [String(category.id), category.name])
  ];
  return `<select name="${name}" data-category-select="${name}">${options.map(([value, label]) => `<option value="${value}" ${String(value) === String(selected || "") ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select>`;
}

function renderSubcategorySelect(categoryId, selected, name, includeAll = false) {
  const category = state.categories.find((item) => String(item.id) === String(categoryId));
  const subcategories = category?.subcategories || [];
  const options = [
    ...(includeAll ? [['', 'All sub-categories']] : [['', 'No sub-category']]),
    ...subcategories.map((sub) => [String(sub.id), sub.name])
  ];
  return `<select name="${name}">${options.map(([value, label]) => `<option value="${value}" ${String(value) === String(selected || "") ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select>`;
}

function renderAccountSelect(selected, name) {
  const options = [['', 'All / none'], ...state.accounts.map((account) => [String(account.id), `${account.name}${account.last4 ? ` (${account.last4})` : ""}`])];
  return `<select name="${name}">${options.map(([value, label]) => `<option value="${value}" ${String(value) === String(selected || "") ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select>`;
}

function renderStatCard(label, value) {
  return `<article class="stat-card"><span class="label">${label}</span><strong>${value}</strong></article>`;
}

async function saveTransaction(event) {
  event.preventDefault();
  const errorNode = app.dashboardView.querySelector("#transaction-error");
  errorNode.textContent = "";
  const data = new FormData(event.currentTarget);
  const payload = {
    txnType: data.get("txnType"),
    txnDate: data.get("txnDate"),
    amount: Number(data.get("amount")),
    accountId: data.get("accountId") || null,
    categoryId: data.get("categoryId") || null,
    subcategoryId: data.get("subcategoryId") || null,
    description: data.get("description"),
    note: data.get("note")
  };

  try {
    if (state.editingTransactionId) {
      await api(`/api/transactions/${state.editingTransactionId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    } else {
      await api("/api/transactions", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }

    state.editingTransactionId = null;
    state.transactionDraft = defaultTransactionDraft();
    await refreshTransactions();
  } catch (error) {
    errorNode.textContent = error.message;
  }
}

async function saveCategory(event) {
  event.preventDefault();
  const errorNode = app.categoriesView.querySelector("#category-error");
  errorNode.textContent = "";
  const data = new FormData(event.currentTarget);
  const payload = {
    name: data.get("name"),
    icon: data.get("icon"),
    parentId: data.get("parentId")
  };

  try {
    const result = await api("/api/categories", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    state.categories = result.categories;
    state.categoryDraft = { name: "", icon: "shapes", parentId: "" };
    renderShell();
  } catch (error) {
    errorNode.textContent = error.message;
  }
}

async function saveAccount(event) {
  event.preventDefault();
  const errorNode = app.accountsView.querySelector("#account-error");
  errorNode.textContent = "";
  const data = new FormData(event.currentTarget);
  const payload = {
    name: data.get("name"),
    last4: data.get("last4")
  };

  try {
    await api("/api/accounts", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    state.accountDraft = { name: "", last4: "" };
    const accountsPayload = await api("/api/accounts");
    state.accounts = accountsPayload.accounts;
    renderShell();
  } catch (error) {
    errorNode.textContent = error.message;
  }
}

function startEditTransaction(id) {
  const txn = state.transactions.find((item) => item.id === id);
  if (!txn) {
    return;
  }
  state.editingTransactionId = id;
  state.transactionDraft = {
    txnType: txn.txnType,
    txnDate: txn.txnDate,
    amount: txn.amount,
    accountId: txn.accountId || "",
    categoryId: txn.categoryId || "",
    subcategoryId: txn.subcategoryId || "",
    description: txn.description || "",
    note: txn.note || ""
  };
  state.currentView = "dashboard";
  renderShell();
}

async function resolveFlag(id) {
  const txn = state.transactions.find((item) => item.id === id);
  if (!txn) {
    return;
  }

  await api(`/api/transactions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      txnType: txn.txnType,
      txnDate: txn.txnDate,
      amount: txn.amount,
      accountId: txn.accountId || null,
      categoryId: txn.categoryId || null,
      subcategoryId: txn.subcategoryId || null,
      description: txn.description,
      note: txn.note,
      duplicate_flag: "resolved"
    })
  });
  await refreshTransactions();
}

async function refreshTransactions() {
  const payload = await api(transactionUrl());
  state.transactions = payload.transactions;
  state.summary = payload.summary;
  renderDashboard();
}

async function logout() {
  await api("/api/logout", { method: "POST" });
  state.bootstrap = {
    hasUser: true,
    user: null
  };
  state.transactions = [];
  renderShell();
}

function defaultTransactionDraft() {
  return {
    txnType: "debit",
    txnDate: today(),
    amount: "",
    accountId: "",
    categoryId: "",
    subcategoryId: "",
    description: "",
    note: ""
  };
}

function transactionUrl() {
  return `/api/transactions?${new URLSearchParams(state.filters).toString()}`;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    credentials: "same-origin",
    ...options
  });

  if (!response.ok) {
    let message = "Request failed.";
    try {
      const body = await response.json();
      message = body.error || message;
    } catch {
      // Ignore malformed error body.
    }
    throw new Error(message);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

function setVisible(node, visible) {
  node.classList.toggle("hidden", !visible);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function offsetDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderFatal(message) {
  app.authView.classList.remove("hidden");
  app.authView.innerHTML = `<div class="empty-state">Unable to start the app: ${escapeHtml(message)}</div>`;
}
