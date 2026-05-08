const state = {
  bootstrap: null,
  currentView: "home",
  homeData: null,
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
  accountDraft: { name: "", last4: "" },
  selectedUploadName: "",
  importFile: null,
  importPreview: null,
  importResult: null
};

const navItems = [
  { id: "home", label: "Home" },
  { id: "dashboard", label: "Dashboard" },
  { id: "categories", label: "Categories" },
  { id: "accounts", label: "Accounts" },
  { id: "imports", label: "Imports" },
  { id: "reports", label: "Reports" }
];

const app = {
  nav: document.querySelector("#nav"),
  authView: document.querySelector("#auth-view"),
  homeView: document.querySelector("#home-view"),
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
  const [homePayload, categoriesPayload, accountsPayload, transactionsPayload] = await Promise.all([
    api("/api/home"),
    api("/api/categories"),
    api("/api/accounts"),
    api(transactionUrl())
  ]);

  state.homeData = homePayload;
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
  renderHome();
  renderDashboard();
  renderCategories();
  renderAccounts();
  renderImports();
  renderReports();

  const visible = {
    home: app.homeView,
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
  setVisible(app.homeView, false);
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

function renderHome() {
  const homeData = state.homeData || emptyHomeData();
  app.homeView.innerHTML = `
    <div class="panel-header">
      <div>
        <p class="eyebrow">Overview</p>
        <h2>Home</h2>
        <p class="muted">A quick monthly snapshot with fast entry points for new transactions and statement uploads.</p>
      </div>
      <div class="month-badge">${escapeHtml(homeData.month.label)}</div>
    </div>
    <div class="stats">
      ${renderStatCard("Debits", formatCurrency(homeData.summary.debit))}
      ${renderStatCard("Credits", formatCurrency(homeData.summary.credit))}
      ${renderStatCard("Transfers", formatCurrency(homeData.summary.transfer))}
      ${renderStatCard("Rows", String(homeData.summary.count))}
    </div>
    <div class="home-grid">
      <section class="report-card">
        <h3>Quick add</h3>
        <p class="muted">Add a transaction without leaving the home page.</p>
        ${renderTransactionForm("home")}
      </section>
      <section class="report-card">
        <h3>Import statement</h3>
        <p class="muted">Start with a CSV or PDF from Google Pay or your bank. The full parser and review workflow stays in the Imports page.</p>
        <div class="stack">
          <label>Choose a CSV or PDF
            <input id="home-upload-input" type="file" accept=".csv,.pdf,application/pdf,text/csv" />
          </label>
          <div class="upload-callout">
            <strong>${state.selectedUploadName ? escapeHtml(state.selectedUploadName) : "No file selected yet"}</strong>
            <span class="muted">Select a file here, then continue in the Imports page for the next step.</span>
          </div>
          <div class="button-row">
            <button type="button" class="secondary" id="go-imports">Go to Imports</button>
            <button type="button" class="ghost" id="go-dashboard">Open dashboard</button>
          </div>
        </div>
      </section>
    </div>
    <div class="chart-grid">
      <section class="report-card">
        <h3>Category spend this month</h3>
        ${renderPieChart(homeData.categoryBreakdown)}
      </section>
      <section class="report-card">
        <h3>Debit vs credit this month</h3>
        ${renderBarChart(homeData.summary)}
      </section>
    </div>
    <section class="report-card" style="margin-top:18px;">
      <div class="panel-header">
        <div>
          <h3>Last 5 transactions</h3>
          <p class="muted">Recent activity from across all accounts.</p>
        </div>
      </div>
      ${renderRecentTransactions(homeData.recentTransactions)}
    </section>
  `;

  wireTransactionForm("home");
  app.homeView.querySelector("#home-upload-input").addEventListener("change", (event) => {
    state.importFile = event.target.files?.[0] || null;
    state.selectedUploadName = state.importFile?.name || "";
    renderHome();
  });
  app.homeView.querySelector("#go-imports").addEventListener("click", () => {
    state.currentView = "imports";
    renderShell();
  });
  app.homeView.querySelector("#go-dashboard").addEventListener("click", () => {
    state.currentView = "dashboard";
    renderShell();
  });
}

function renderDashboard() {
  app.dashboardView.innerHTML = `
    <div class="panel-header">
      <div>
        <p class="eyebrow">Transactions</p>
        <h2>Dashboard</h2>
        <p class="muted">Use filters, inspect rows, edit transactions, and export the current view.</p>
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
            <label>Type${renderTypeSelect(state.filters.txnType, "txnType", true)}</label>
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
        <h3>${state.editingTransactionId ? "Edit transaction" : "Edit support"}</h3>
        ${
          state.editingTransactionId
            ? `${renderTransactionForm("dashboard")}
              <p class="muted">You are editing transaction #${state.editingTransactionId}.</p>`
            : `<div class="empty-state">Choose a row below and click edit to update it here. New entries can be added from the Home page.</div>`
        }
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

  if (state.editingTransactionId) {
    wireTransactionForm("dashboard");
    const cancelEdit = app.dashboardView.querySelector("#cancel-edit");
    if (cancelEdit) {
      cancelEdit.addEventListener("click", () => {
        state.editingTransactionId = null;
        state.transactionDraft = defaultTransactionDraft();
        renderDashboard();
      });
    }
  }

  app.dashboardView.querySelectorAll("[data-edit-transaction]").forEach((button) => {
    button.addEventListener("click", () => startEditTransaction(Number(button.dataset.editTransaction)));
  });
  app.dashboardView.querySelectorAll("[data-resolve-flag]").forEach((button) => {
    button.addEventListener("click", () => resolveFlag(Number(button.dataset.resolveFlag)));
  });
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
        <p class="muted">This version still stores a simple icon key. The visual icon picker and image uploads can land next without changing the data model.</p>
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
                <thead><tr><th>Name</th><th>Last 4</th><th></th></tr></thead>
                <tbody>${state.accounts.map((account) => `
                  <tr>
                    <td>${escapeHtml(account.name)}</td>
                    <td>${escapeHtml(account.last4 || "")}</td>
                    <td><button type="button" class="danger" data-delete-account="${account.id}">Delete</button></td>
                  </tr>
                `).join("")}</tbody>
              </table>`
            : `<div class="empty-state">No accounts yet. Add one for better tracking across bank statements and cash entries.</div>`
        }
      </section>
    </div>
  `;

  app.accountsView.querySelector("#account-form").addEventListener("submit", saveAccount);
  app.accountsView.querySelectorAll("[data-delete-account]").forEach((button) => {
    button.addEventListener("click", () => deleteAccount(Number(button.dataset.deleteAccount)));
  });
}

function renderImports() {
  const preview = state.importPreview;
  const summary = preview?.summary;
  app.importsView.innerHTML = `
    <div class="panel-header">
      <div>
        <p class="eyebrow">Imports</p>
        <h2>CSV import review</h2>
        <p class="muted">Upload a CSV, let the app infer the fields locally, and approve the rows you want to save.</p>
      </div>
    </div>
    <section class="report-card">
      <div class="split">
        <div class="stack">
          <h3>Choose CSV</h3>
          <label>Select a bank or Google Pay CSV
            <input id="imports-file-input" type="file" accept=".csv,text/csv" />
          </label>
          <div class="upload-callout">
            <strong>${state.selectedUploadName ? escapeHtml(state.selectedUploadName) : "No CSV selected yet"}</strong>
            <span class="muted">CSV import is live now. PDF parsing can follow next.</span>
          </div>
          <div class="button-row">
            <button type="button" class="primary" id="preview-import" ${state.importFile ? "" : "disabled"}>Preview CSV</button>
            <button type="button" class="ghost" id="clear-import" ${state.importFile || preview ? "" : "disabled"}>Clear</button>
          </div>
          <p class="inline-error" id="import-error"></p>
          ${state.importResult ? `<p class="muted">${escapeHtml(state.importResult)}</p>` : ""}
        </div>
        <div class="report-card">
          <h3>How this works</h3>
          <ul>
            <li>The browser reads the CSV locally.</li>
            <li>The local server infers date, amount, type, description, category, and account.</li>
            <li>Hard duplicates are excluded by default.</li>
            <li>You can edit rows before import.</li>
          </ul>
        </div>
      </div>
    </section>
    ${
      preview
        ? `<section class="report-card" style="margin-top:18px;">
            <div class="panel-header">
              <div>
                <h3>Review rows</h3>
                <p class="muted">${summary.total} rows found, ${summary.hardDuplicates} hard duplicates, ${summary.nearDuplicates} near-duplicates, ${summary.needsCategory} rows needing category review.</p>
              </div>
              <div class="button-row">
                <button type="button" class="primary" id="commit-import">Import selected rows</button>
              </div>
            </div>
            ${renderImportPreviewTable(preview.rows)}
          </section>`
        : ""
    }
  `;

  const fileInput = app.importsView.querySelector("#imports-file-input");
  if (fileInput) {
    fileInput.addEventListener("change", (event) => {
      state.importFile = event.target.files?.[0] || null;
      state.selectedUploadName = state.importFile?.name || "";
      state.importResult = null;
      renderImports();
    });
  }

  app.importsView.querySelector("#preview-import")?.addEventListener("click", previewImportCsv);
  app.importsView.querySelector("#clear-import")?.addEventListener("click", () => {
    state.importFile = null;
    state.selectedUploadName = "";
    state.importPreview = null;
    state.importResult = null;
    renderImports();
  });

  if (preview) {
    app.importsView.querySelector("#commit-import")?.addEventListener("click", commitImportRows);
    app.importsView.querySelectorAll("[data-import-field]").forEach((node) => {
      node.addEventListener("change", handleImportPreviewChange);
      node.addEventListener("input", handleImportPreviewChange);
    });
  }
}

function renderReports() {
  app.reportsView.innerHTML = `
    <div class="panel-header">
      <div>
        <p class="eyebrow">Reports</p>
        <h2>Exports and summaries</h2>
        <p class="muted">CSV export is live in this version. Formatted PDF reports are next.</p>
      </div>
    </div>
    <section class="report-card">
      <h3>Current export support</h3>
      <ul>
        <li>Download the currently filtered dashboard as CSV.</li>
        <li>Monthly charts on Home use this month’s transactions only.</li>
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

function renderTransactionForm(context) {
  const includeCancel = context === "dashboard" && state.editingTransactionId;
  return `
    <form id="${context}-transaction-form" class="stack">
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
        ${includeCancel ? '<button type="button" class="ghost" id="cancel-edit">Cancel</button>' : ""}
      </div>
      <p class="inline-error" id="${context}-transaction-error"></p>
    </form>
  `;
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
            <td>${escapeHtml(txn.categoryName || "")}${txn.subcategoryName ? `<div class="muted">${escapeHtml(txn.subcategoryName)}</div>` : ""}</td>
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

function renderRecentTransactions(transactions) {
  if (!transactions.length) {
    return `<div class="empty-state">No recent transactions yet.</div>`;
  }

  return `
    <table class="simple-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Type</th>
          <th>Amount</th>
          <th>Category</th>
          <th>Account</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        ${transactions.map((txn) => `
          <tr>
            <td>${escapeHtml(txn.txnDate)}</td>
            <td><span class="type-pill ${txn.txnType}">${escapeHtml(txn.txnType)}</span></td>
            <td>${formatCurrency(txn.amount)}</td>
            <td>${escapeHtml(txn.categoryName || "")}</td>
            <td>${escapeHtml(txn.accountDisplay || "")}</td>
            <td>${escapeHtml(txn.description || "")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderPieChart(items) {
  if (!items.length) {
    return `<div class="empty-state">No debit spend recorded this month yet.</div>`;
  }

  const total = items.reduce((sum, item) => sum + item.amount, 0);
  let angle = -Math.PI / 2;
  const radius = 82;
  const center = 110;
  const colors = ["#2b6cb0", "#4c8ed9", "#66a4e7", "#8dbcf0", "#b0d1f7", "#1f4f83", "#3d79be"];

  const slices = items.map((item, index) => {
    const fraction = item.amount / total;
    const nextAngle = angle + fraction * Math.PI * 2;
    const x1 = center + radius * Math.cos(angle);
    const y1 = center + radius * Math.sin(angle);
    const x2 = center + radius * Math.cos(nextAngle);
    const y2 = center + radius * Math.sin(nextAngle);
    const largeArc = fraction > 0.5 ? 1 : 0;
    const path = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    angle = nextAngle;
    return `<path d="${path}" fill="${colors[index % colors.length]}"></path>`;
  }).join("");

  return `
    <div class="chart-wrap">
      <svg viewBox="0 0 220 220" class="chart-svg" aria-label="Category spend pie chart">
        ${slices}
        <circle cx="${center}" cy="${center}" r="42" fill="#fcfeff"></circle>
        <text x="${center}" y="${center - 4}" text-anchor="middle" class="chart-total-label">Spend</text>
        <text x="${center}" y="${center + 18}" text-anchor="middle" class="chart-total-value">${formatShortCurrency(total)}</text>
      </svg>
      <div class="chart-legend">
        ${items.map((item, index) => `
          <div class="legend-row">
            <span class="legend-swatch" style="background:${colors[index % colors.length]}"></span>
            <span>${escapeHtml(item.name)}</span>
            <strong>${formatCurrency(item.amount)}</strong>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderBarChart(summary) {
  const values = [
    { label: "Debit", key: "debit", value: summary.debit, color: "#2b6cb0" },
    { label: "Credit", key: "credit", value: summary.credit, color: "#4c8ed9" }
  ];
  const max = Math.max(...values.map((item) => item.value), 1);

  return `
    <div class="bar-chart">
      ${values.map((item) => {
        const height = Math.max((item.value / max) * 220, item.value ? 24 : 12);
        return `
          <div class="bar-group">
            <div class="bar-value">${formatShortCurrency(item.value)}</div>
            <div class="bar-column">
              <div class="bar-fill" style="height:${height}px;background:${item.color};"></div>
            </div>
            <div class="bar-label">${item.label}</div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderImportPreviewTable(rows) {
  return `
    <div class="import-table-wrap">
      <table class="transactions-table imports-preview-table">
        <thead>
          <tr>
            <th>Use</th>
            <th>Row</th>
            <th>Date</th>
            <th>Type</th>
            <th>Amount</th>
            <th>Category</th>
            <th>Sub-category</th>
            <th>Account</th>
            <th>Description</th>
            <th>Note</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, index) => `
            <tr>
              <td><input type="checkbox" data-import-field="includeInImport" data-row-index="${index}" ${row.includeInImport ? "checked" : ""} ${row.duplicateStatus === "hard_duplicate" ? "disabled" : ""} /></td>
              <td>${row.rowIndex}</td>
              <td><input type="date" value="${escapeHtml(row.txnDate || "")}" data-import-field="txnDate" data-row-index="${index}" /></td>
              <td>${renderImportTypeSelect(row.txnType, index)}</td>
              <td><input type="number" min="0.01" step="0.01" value="${row.amount || ""}" data-import-field="amount" data-row-index="${index}" /></td>
              <td>${renderImportCategorySelect(row.categoryId, index)}</td>
              <td>${renderImportSubcategorySelect(row.categoryId, row.subcategoryId, index)}</td>
              <td>${renderImportAccountSelect(row.accountId, index)}</td>
              <td><input type="text" maxlength="120" value="${escapeHtml(row.description || "")}" data-import-field="description" data-row-index="${index}" /></td>
              <td><input type="text" maxlength="70" value="${escapeHtml(row.note || "")}" data-import-field="note" data-row-index="${index}" /></td>
              <td>
                <span class="flag-pill ${row.duplicateStatus === "none" ? "resolved" : row.duplicateStatus}">${escapeHtml(row.duplicateStatus.replace("_", " "))}</span>
                ${row.duplicateReference ? `<div class="muted">${escapeHtml(row.duplicateReference)}</div>` : ""}
                ${row.warnings?.length ? `<div class="muted">${escapeHtml(row.warnings.join(" "))}</div>` : ""}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderImportTypeSelect(selected, rowIndex) {
  return `
    <select data-import-field="txnType" data-row-index="${rowIndex}">
      ${["debit", "credit", "transfer"].map((value) => `<option value="${value}" ${value === selected ? "selected" : ""}>${value}</option>`).join("")}
    </select>
  `;
}

function renderImportCategorySelect(selected, rowIndex) {
  const options = [["", "Select category"], ...state.categories.map((category) => [String(category.id), category.name])];
  return `
    <select data-import-field="categoryId" data-row-index="${rowIndex}">
      ${options.map(([value, label]) => `<option value="${value}" ${String(value) === String(selected || "") ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
    </select>
  `;
}

function renderImportSubcategorySelect(categoryId, selected, rowIndex) {
  const category = state.categories.find((item) => String(item.id) === String(categoryId));
  const subcategories = category?.subcategories || [];
  const options = [["", "No sub-category"], ...subcategories.map((sub) => [String(sub.id), sub.name])];
  return `
    <select data-import-field="subcategoryId" data-row-index="${rowIndex}">
      ${options.map(([value, label]) => `<option value="${value}" ${String(value) === String(selected || "") ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
    </select>
  `;
}

function renderImportAccountSelect(selected, rowIndex) {
  const options = [["", "None"], ...state.accounts.map((account) => [String(account.id), `${account.name}${account.last4 ? ` (${account.last4})` : ""}`])];
  return `
    <select data-import-field="accountId" data-row-index="${rowIndex}">
      ${options.map(([value, label]) => `<option value="${value}" ${String(value) === String(selected || "") ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
    </select>
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
    ...(includeAll ? [["all", "All types"]] : []),
    ["debit", "Debit"],
    ["credit", "Credit"],
    ["transfer", "Transfer"]
  ];
  return `<select name="${name}">${options.map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`).join("")}</select>`;
}

function renderCategorySelect(selected, name, includeAll = false) {
  const options = [
    ...(includeAll ? [["", "All categories"]] : [["", "Select category"]]),
    ...state.categories.map((category) => [String(category.id), category.name])
  ];
  return `<select name="${name}">${options.map(([value, label]) => `<option value="${value}" ${String(value) === String(selected || "") ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select>`;
}

function renderSubcategorySelect(categoryId, selected, name, includeAll = false) {
  const category = state.categories.find((item) => String(item.id) === String(categoryId));
  const subcategories = category?.subcategories || [];
  const options = [
    ...(includeAll ? [["", "All sub-categories"]] : [["", "No sub-category"]]),
    ...subcategories.map((sub) => [String(sub.id), sub.name])
  ];
  return `<select name="${name}">${options.map(([value, label]) => `<option value="${value}" ${String(value) === String(selected || "") ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select>`;
}

function renderAccountSelect(selected, name) {
  const options = [["", "All / none"], ...state.accounts.map((account) => [String(account.id), `${account.name}${account.last4 ? ` (${account.last4})` : ""}`])];
  return `<select name="${name}">${options.map(([value, label]) => `<option value="${value}" ${String(value) === String(selected || "") ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select>`;
}

function renderStatCard(label, value) {
  return `<article class="stat-card"><span class="label">${label}</span><strong>${value}</strong></article>`;
}

function wireTransactionForm(context) {
  const form = document.querySelector(`#${context}-transaction-form`);
  form?.addEventListener("submit", (event) => saveTransaction(event, context));
}

async function saveTransaction(event, context) {
  event.preventDefault();
  const errorNode = document.querySelector(`#${context}-transaction-error`);
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
    await refreshDataAfterTransactionChange();
  } catch (error) {
    errorNode.textContent = error.message;
  }
}

async function refreshDataAfterTransactionChange() {
  const [homePayload, transactionsPayload] = await Promise.all([
    api("/api/home"),
    api(transactionUrl())
  ]);
  state.homeData = homePayload;
  state.transactions = transactionsPayload.transactions;
  state.summary = transactionsPayload.summary;
  renderShell();
}

async function previewImportCsv() {
  const errorNode = app.importsView.querySelector("#import-error");
  if (errorNode) {
    errorNode.textContent = "";
  }
  state.importResult = null;

  try {
    if (!state.importFile) {
      throw new Error("Choose a CSV file first.");
    }

    const csvText = await state.importFile.text();
    const rawRows = parseCsvText(csvText);
    const rowObjects = csvRowsToObjects(rawRows);
    if (!rowObjects.length) {
      throw new Error("The CSV did not contain any data rows.");
    }

    state.importPreview = await api("/api/imports/preview", {
      method: "POST",
      body: JSON.stringify({
        fileName: state.importFile.name,
        rows: rowObjects
      })
    });
    renderImports();
  } catch (error) {
    if (errorNode) {
      errorNode.textContent = error.message;
    }
  }
}

function handleImportPreviewChange(event) {
  const rowIndex = Number(event.target.dataset.rowIndex);
  const field = event.target.dataset.importField;
  const row = state.importPreview?.rows?.[rowIndex];
  if (!row || !field) {
    return;
  }

  if (field === "includeInImport") {
    row.includeInImport = event.target.checked;
  } else if (field === "amount") {
    row.amount = Number(event.target.value || 0);
  } else if (field === "categoryId" || field === "subcategoryId" || field === "accountId") {
    row[field] = event.target.value ? Number(event.target.value) : null;
    if (field === "categoryId") {
      row.subcategoryId = null;
      renderImports();
      return;
    }
  } else {
    row[field] = event.target.value;
  }
}

async function commitImportRows() {
  const errorNode = app.importsView.querySelector("#import-error");
  if (errorNode) {
    errorNode.textContent = "";
  }

  try {
    if (!state.importPreview?.rows?.length) {
      throw new Error("Preview a CSV before importing.");
    }

    const invalidRow = state.importPreview.rows.find((row) =>
      row.includeInImport &&
      ((row.txnType === "debit" || row.txnType === "credit") && !row.categoryId)
    );
    if (invalidRow) {
      throw new Error(`Row ${invalidRow.rowIndex} still needs a category before import.`);
    }

    const result = await api("/api/imports/commit", {
      method: "POST",
      body: JSON.stringify({
        rows: state.importPreview.rows
      })
    });

    state.importResult = `Imported ${result.counts.imported} rows, skipped ${result.counts.skipped}, errors ${result.counts.errors}.`;
    state.importPreview = null;
    state.importFile = null;
    state.selectedUploadName = "";
    await loadAppData();
    state.currentView = "imports";
    renderShell();
  } catch (error) {
    if (errorNode) {
      errorNode.textContent = error.message;
    }
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

async function deleteAccount(id) {
  try {
    await api(`/api/accounts/${id}`, { method: "DELETE" });
    const accountsPayload = await api("/api/accounts");
    state.accounts = accountsPayload.accounts;
    renderShell();
  } catch (error) {
    const errorNode = app.accountsView.querySelector("#account-error");
    if (errorNode) {
      errorNode.textContent = error.message;
    }
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
  await refreshDataAfterTransactionChange();
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
  state.homeData = null;
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

function formatShortCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(Number(value || 0));
}

function today() {
  return localDateString(new Date());
}

function offsetDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

function parseCsvText(csvText) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        index += 1;
      }
      row.push(current);
      if (row.some((value) => String(value).trim() !== "")) {
        rows.push(row);
      }
      row = [];
      current = "";
    } else {
      current += char;
    }
  }

  row.push(current);
  if (row.some((value) => String(value).trim() !== "")) {
    rows.push(row);
  }

  return rows;
}

function csvRowsToObjects(rows) {
  if (!rows.length) {
    return [];
  }

  const headers = rows[0].map((header, index) => {
    const cleaned = String(header || "").trim();
    return cleaned || `column_${index + 1}`;
  });

  return rows.slice(1).map((cells) => {
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    return row;
  }).filter((row) => Object.values(row).some((value) => String(value).trim() !== ""));
}

function emptyHomeData() {
  return {
    month: { label: "This month" },
    summary: { debit: 0, credit: 0, transfer: 0, count: 0 },
    categoryBreakdown: [],
    recentTransactions: []
  };
}

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
