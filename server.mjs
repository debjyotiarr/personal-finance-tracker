import { createServer } from "node:http";
import { readFile, stat, mkdir } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID, pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "app.db");
const uploadsDir = path.join(dataDir, "uploads");
const exportsDir = path.join(dataDir, "exports");
const sessions = new Map();
const nearDuplicateTolerance = 10;
const defaultPort = Number(process.env.PORT || 3000);
const defaultHost = process.env.HOST || "127.0.0.1";

await ensureDirectories();
const db = new DatabaseSync(dbPath);
initializeDatabase(db);
ensureAccountsSchema(db);
ensureTransactionsSchema(db);
seedStarterCategories(db);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Internal server error" });
  }
});

server.on("error", (error) => {
  console.error(`Unable to start FinanceTracker on http://${defaultHost}:${defaultPort}`);
  console.error(error);
  process.exitCode = 1;
});

server.listen(defaultPort, defaultHost, () => {
  console.log(`FinanceTracker running at http://${defaultHost}:${defaultPort}`);
});

async function ensureDirectories() {
  await mkdir(dataDir, { recursive: true });
  await mkdir(uploadsDir, { recursive: true });
  await mkdir(exportsDir, { recursive: true });
}

function initializeDatabase(database) {
  database.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      icon TEXT NOT NULL,
      parent_id INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(parent_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      last4 TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      txn_type TEXT NOT NULL CHECK(txn_type IN ('debit', 'credit', 'transfer')),
      txn_date TEXT NOT NULL,
      posted_date TEXT,
      amount REAL NOT NULL CHECK(amount > 0),
      category_id INTEGER,
      subcategory_id INTEGER,
      account_id INTEGER,
      description TEXT NOT NULL DEFAULT '',
      note TEXT DEFAULT '',
      duplicate_flag TEXT NOT NULL DEFAULT 'none' CHECK(duplicate_flag IN ('none', 'near_duplicate', 'resolved')),
      duplicate_reference TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(category_id) REFERENCES categories(id),
      FOREIGN KEY(subcategory_id) REFERENCES categories(id),
      FOREIGN KEY(account_id) REFERENCES accounts(id)
    );
  `);
}

function seedStarterCategories(database) {
  const count = database.prepare("SELECT COUNT(*) AS count FROM categories WHERE parent_id IS NULL").get().count;
  if (count > 0) {
    return;
  }

  const starterCategories = [
    ["Food", "fork-knife"],
    ["Groceries", "basket"],
    ["Transport", "car"],
    ["Bills", "receipt"],
    ["Shopping", "bag"],
    ["Health", "heart-pulse"],
    ["Entertainment", "film"],
    ["Travel", "plane"],
    ["Income", "wallet"],
    ["Transfers", "arrows-left-right"],
    ["Miscellaneous", "shapes"]
  ];

  const insert = database.prepare(`
    INSERT INTO categories (name, icon, parent_id)
    VALUES (?, ?, NULL)
  `);

  for (const [name, icon] of starterCategories) {
    insert.run(name, icon);
  }
}

function ensureAccountsSchema(database) {
  const tableSqlRow = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'accounts'")
    .get();

  if (!tableSqlRow?.sql) {
    database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_name_last4
      ON accounts (name, IFNULL(last4, ''));
    `);
    return;
  }

  const needsMigration = tableSqlRow.sql.includes("name TEXT NOT NULL UNIQUE");
  if (needsMigration) {
    database.exec("PRAGMA foreign_keys = OFF;");
    database.exec("BEGIN;");
    try {
      database.exec(`
        ALTER TABLE accounts RENAME TO accounts_legacy;

        CREATE TABLE accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          last4 TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        INSERT INTO accounts (id, name, last4, created_at, updated_at)
        SELECT id, name, last4, created_at, updated_at
        FROM accounts_legacy;

        DROP TABLE accounts_legacy;
      `);
      database.exec("COMMIT;");
    } catch (error) {
      database.exec("ROLLBACK;");
      database.exec("PRAGMA foreign_keys = ON;");
      throw error;
    }
    database.exec("PRAGMA foreign_keys = ON;");
  }

  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_name_last4
    ON accounts (name, IFNULL(last4, ''));
  `);
}

function ensureTransactionsSchema(database) {
  const tableSqlRow = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'transactions'")
    .get();

  if (!tableSqlRow?.sql || !tableSqlRow.sql.includes('"accounts_legacy"')) {
    return;
  }

  database.exec("PRAGMA foreign_keys = OFF;");
  database.exec("BEGIN;");
  try {
    database.exec(`
      ALTER TABLE transactions RENAME TO transactions_legacy;

      CREATE TABLE transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        txn_type TEXT NOT NULL CHECK(txn_type IN ('debit', 'credit', 'transfer')),
        txn_date TEXT NOT NULL,
        posted_date TEXT,
        amount REAL NOT NULL CHECK(amount > 0),
        category_id INTEGER,
        subcategory_id INTEGER,
        account_id INTEGER,
        description TEXT NOT NULL DEFAULT '',
        note TEXT DEFAULT '',
        duplicate_flag TEXT NOT NULL DEFAULT 'none' CHECK(duplicate_flag IN ('none', 'near_duplicate', 'resolved')),
        duplicate_reference TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(category_id) REFERENCES categories(id),
        FOREIGN KEY(subcategory_id) REFERENCES categories(id),
        FOREIGN KEY(account_id) REFERENCES accounts(id)
      );

      INSERT INTO transactions (
        id, txn_type, txn_date, posted_date, amount, category_id, subcategory_id,
        account_id, description, note, duplicate_flag, duplicate_reference,
        created_at, updated_at
      )
      SELECT
        id, txn_type, txn_date, posted_date, amount, category_id, subcategory_id,
        account_id, description, note, duplicate_flag, duplicate_reference,
        created_at, updated_at
      FROM transactions_legacy;

      DROP TABLE transactions_legacy;
    `);
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    database.exec("PRAGMA foreign_keys = ON;");
    throw error;
  }
  database.exec("PRAGMA foreign_keys = ON;");
}

async function handleApi(req, res, url) {
  const session = getSession(req);

  if (req.method === "GET" && url.pathname === "/api/bootstrap") {
    const user = getCurrentUser(session);
    sendJson(res, 200, {
      hasUser: hasAnyUser(),
      user
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/setup") {
    if (hasAnyUser()) {
      sendJson(res, 400, { error: "Setup is already complete." });
      return;
    }

    const body = await readJson(req);
    const username = sanitizeText(body.username, 40);
    const password = String(body.password || "");

    if (!username || password.length < 8) {
      sendJson(res, 400, { error: "Username is required and password must be at least 8 characters." });
      return;
    }

    const { hash, salt } = hashPassword(password);
    const result = db.prepare(`
      INSERT INTO users (username, password_hash, password_salt)
      VALUES (?, ?, ?)
    `).run(username, hash, salt);

    const createdUser = db.prepare("SELECT id, username FROM users WHERE id = ?").get(result.lastInsertRowid);
    createSession(res, createdUser);
    sendJson(res, 201, { user: createdUser });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    const body = await readJson(req);
    const username = sanitizeText(body.username, 40);
    const password = String(body.password || "");
    const userRow = db.prepare("SELECT * FROM users WHERE username = ?").get(username);

    if (!userRow || !verifyPassword(password, userRow.password_salt, userRow.password_hash)) {
      sendJson(res, 401, { error: "Invalid username or password." });
      return;
    }

    createSession(res, { id: userRow.id, username: userRow.username });
    sendJson(res, 200, { user: { id: userRow.id, username: userRow.username } });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    destroySession(req, res);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (!session) {
    sendJson(res, 401, { error: "Authentication required." });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/home") {
    sendJson(res, 200, fetchHomeData());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/categories") {
    sendJson(res, 200, { categories: fetchCategories() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/categories") {
    const body = await readJson(req);
    const payload = validateCategoryPayload(body);
    if (payload.error) {
      sendJson(res, 400, { error: payload.error });
      return;
    }

    const topLevelCount = db.prepare("SELECT COUNT(*) AS count FROM categories WHERE parent_id IS NULL").get().count;
    if (!payload.parentId && topLevelCount >= 50) {
      sendJson(res, 400, { error: "The maximum of 50 top-level categories has been reached." });
      return;
    }

    const inserted = db.prepare(`
      INSERT INTO categories (name, icon, parent_id, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    `).run(payload.name, payload.icon, payload.parentId);

    const created = db.prepare("SELECT * FROM categories WHERE id = ?").get(inserted.lastInsertRowid);
    sendJson(res, 201, { category: created, categories: fetchCategories() });
    return;
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/categories/")) {
    const id = Number(url.pathname.split("/").pop());
    const existing = db.prepare("SELECT * FROM categories WHERE id = ?").get(id);
    if (!existing) {
      sendJson(res, 404, { error: "Category not found." });
      return;
    }

    const body = await readJson(req);
    const payload = validateCategoryPayload({ ...existing, ...body });
    if (payload.error) {
      sendJson(res, 400, { error: payload.error });
      return;
    }

    db.prepare(`
      UPDATE categories
      SET name = ?, icon = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(payload.name, payload.icon, id);

    sendJson(res, 200, { categories: fetchCategories() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/accounts") {
    const accounts = db.prepare(`
      SELECT id, name, last4, created_at, updated_at
      FROM accounts
      ORDER BY name COLLATE NOCASE ASC
    `).all();
    sendJson(res, 200, { accounts });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/accounts") {
    const body = await readJson(req);
    const payload = validateAccountPayload(body);
    if (payload.error) {
      sendJson(res, 400, { error: payload.error });
      return;
    }

    let inserted;
    try {
      inserted = db.prepare(`
        INSERT INTO accounts (name, last4, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `).run(payload.name, payload.last4);
    } catch (error) {
      if (isSqliteConstraintError(error)) {
        sendJson(res, 400, { error: "An account with the same name and last 4 digits already exists." });
        return;
      }
      throw error;
    }

    const account = db.prepare("SELECT * FROM accounts WHERE id = ?").get(inserted.lastInsertRowid);
    sendJson(res, 201, { account });
    return;
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/accounts/")) {
    const id = Number(url.pathname.split("/").pop());
    const existing = db.prepare("SELECT * FROM accounts WHERE id = ?").get(id);
    if (!existing) {
      sendJson(res, 404, { error: "Account not found." });
      return;
    }

    const body = await readJson(req);
    const payload = validateAccountPayload({ ...existing, ...body });
    if (payload.error) {
      sendJson(res, 400, { error: payload.error });
      return;
    }

    try {
      db.prepare(`
        UPDATE accounts
        SET name = ?, last4 = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(payload.name, payload.last4, id);
    } catch (error) {
      if (isSqliteConstraintError(error)) {
        sendJson(res, 400, { error: "An account with the same name and last 4 digits already exists." });
        return;
      }
      throw error;
    }

    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/accounts/")) {
    const id = Number(url.pathname.split("/").pop());
    const existing = db.prepare("SELECT * FROM accounts WHERE id = ?").get(id);
    if (!existing) {
      sendJson(res, 404, { error: "Account not found." });
      return;
    }

    const usage = db
      .prepare("SELECT COUNT(*) AS count FROM transactions WHERE account_id = ?")
      .get(id);

    if (usage.count > 0) {
      sendJson(res, 409, {
        error: `This account is used by ${usage.count} transaction${usage.count === 1 ? "" : "s"}. Reassign or edit those transactions before deleting the account.`
      });
      return;
    }

    db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/transactions") {
    sendJson(res, 200, fetchTransactions(url.searchParams));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/transactions") {
    const body = await readJson(req);
    const payload = validateTransactionPayload(body);
    if (payload.error) {
      sendJson(res, 400, { error: payload.error });
      return;
    }

    const duplicateInfo = detectNearDuplicate(payload);
    const inserted = db.prepare(`
      INSERT INTO transactions (
        txn_type, txn_date, posted_date, amount, category_id, subcategory_id,
        account_id, description, note, duplicate_flag, duplicate_reference, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      payload.txnType,
      payload.txnDate,
      payload.postedDate,
      payload.amount,
      payload.categoryId,
      payload.subcategoryId,
      payload.accountId,
      payload.description,
      payload.note,
      duplicateInfo.flag,
      duplicateInfo.reference
    );

    const transaction = fetchTransactionById(inserted.lastInsertRowid);
    sendJson(res, 201, { transaction });
    return;
  }

  if (req.method === "PATCH" && url.pathname.startsWith("/api/transactions/")) {
    const id = Number(url.pathname.split("/").pop());
    const existing = db.prepare("SELECT * FROM transactions WHERE id = ?").get(id);
    if (!existing) {
      sendJson(res, 404, { error: "Transaction not found." });
      return;
    }

    const body = await readJson(req);
    const payload = validateTransactionPayload({ ...existing, ...body });
    if (payload.error) {
      sendJson(res, 400, { error: payload.error });
      return;
    }

    const duplicateInfo = body.duplicate_flag === "resolved"
      ? { flag: "resolved", reference: existing.duplicate_reference || "" }
      : detectNearDuplicate(payload, id);

    db.prepare(`
      UPDATE transactions
      SET txn_type = ?, txn_date = ?, posted_date = ?, amount = ?, category_id = ?,
          subcategory_id = ?, account_id = ?, description = ?, note = ?,
          duplicate_flag = ?, duplicate_reference = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      payload.txnType,
      payload.txnDate,
      payload.postedDate,
      payload.amount,
      payload.categoryId,
      payload.subcategoryId,
      payload.accountId,
      payload.description,
      payload.note,
      duplicateInfo.flag,
      duplicateInfo.reference,
      id
    );

    sendJson(res, 200, { transaction: fetchTransactionById(id) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/imports/preview") {
    const body = await readJson(req);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) {
      sendJson(res, 400, { error: "No CSV rows were provided." });
      return;
    }

    const previewRows = rows.map((row, index) => buildImportPreviewRow(row, index));
    sendJson(res, 200, {
      fileName: sanitizeText(body.fileName, 120),
      rows: previewRows,
      summary: summarizeImportPreview(previewRows)
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/imports/commit") {
    const body = await readJson(req);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) {
      sendJson(res, 400, { error: "No import rows were provided." });
      return;
    }

    const imported = [];
    const skipped = [];
    const errors = [];

    for (const [index, row] of rows.entries()) {
      if (!row.includeInImport) {
        skipped.push({ rowIndex: row.rowIndex ?? index + 1, reason: "Excluded from import" });
        continue;
      }

      const payload = validateTransactionPayload({
        txnType: row.txnType,
        txnDate: row.txnDate,
        amount: row.amount,
        categoryId: row.categoryId,
        subcategoryId: row.subcategoryId,
        accountId: row.accountId,
        description: row.description,
        note: row.note
      });

      if (payload.error) {
        errors.push({ rowIndex: row.rowIndex ?? index + 1, error: payload.error });
        continue;
      }

      const duplicateInfo = detectImportDuplicate(payload);
      if (duplicateInfo.status === "hard_duplicate") {
        skipped.push({
          rowIndex: row.rowIndex ?? index + 1,
          reason: duplicateInfo.reference || "Already present"
        });
        continue;
      }

      const nearDuplicateInfo = duplicateInfo.status === "near_duplicate"
        ? { flag: "near_duplicate", reference: duplicateInfo.reference || "" }
        : detectNearDuplicate(payload);

      const inserted = db.prepare(`
        INSERT INTO transactions (
          txn_type, txn_date, posted_date, amount, category_id, subcategory_id,
          account_id, description, note, duplicate_flag, duplicate_reference, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(
        payload.txnType,
        payload.txnDate,
        payload.postedDate,
        payload.amount,
        payload.categoryId,
        payload.subcategoryId,
        payload.accountId,
        payload.description,
        payload.note,
        nearDuplicateInfo.flag,
        nearDuplicateInfo.reference
      );

      imported.push(fetchTransactionById(inserted.lastInsertRowid));
    }

    sendJson(res, 200, {
      imported,
      skipped,
      errors,
      counts: {
        imported: imported.length,
        skipped: skipped.length,
        errors: errors.length
      }
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/export.csv") {
    const result = fetchTransactions(url.searchParams);
    const rows = [
      ["Date", "Type", "Amount", "Category", "Sub-category", "Account", "Description", "Note", "Flag"],
      ...result.transactions.map((txn) => [
        txn.txnDate,
        txn.txnType,
        txn.amount.toFixed(2),
        txn.categoryName || "",
        txn.subcategoryName || "",
        txn.accountDisplay || "",
        txn.description || "",
        txn.note || "",
        txn.duplicateFlag || ""
      ])
    ];

    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="finance-tracker-export.csv"`
    });
    res.end(csv);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/summary") {
    sendJson(res, 200, buildSummary(fetchTransactions(url.searchParams).transactions));
    return;
  }

  sendJson(res, 404, { error: "Not found." });
}

async function serveStatic(req, res, url) {
  let targetPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const normalized = path.normalize(targetPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, normalized);

  if (!filePath.startsWith(publicDir)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  const fallback = path.join(publicDir, "index.html");
  const candidate = existsSync(filePath) ? filePath : fallback;
  const fileStat = await stat(candidate);

  if (!fileStat.isFile()) {
    sendText(res, 404, "Not found");
    return;
  }

  const contentType = getContentType(candidate);
  res.writeHead(200, { "Content-Type": contentType });
  createReadStream(candidate).pipe(res);
}

function hasAnyUser() {
  return db.prepare("SELECT COUNT(*) AS count FROM users").get().count > 0;
}

function getCurrentUser(session) {
  if (!session) {
    return null;
  }

  return db.prepare("SELECT id, username FROM users WHERE id = ?").get(session.userId) || null;
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  const sessionId = cookies.session;
  if (!sessionId) {
    return null;
  }

  return sessions.get(sessionId) || null;
}

function createSession(res, user) {
  const sessionId = randomUUID();
  sessions.set(sessionId, { id: sessionId, userId: user.id, createdAt: Date.now() });
  res.setHeader("Set-Cookie", `session=${sessionId}; HttpOnly; Path=/; SameSite=Lax`);
}

function destroySession(req, res) {
  const cookies = parseCookies(req.headers.cookie || "");
  if (cookies.session) {
    sessions.delete(cookies.session);
  }
  res.setHeader("Set-Cookie", "session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
}

function parseCookies(cookieHeader) {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [key, ...rest] = part.split("=");
        return [key, decodeURIComponent(rest.join("="))];
      })
  );
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (!chunks.length) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8"
  };
  return types[ext] || "application/octet-stream";
}

function sanitizeText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function hashPassword(password, salt = randomUUID()) {
  const hash = pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return { hash, salt };
}

function verifyPassword(password, salt, expectedHash) {
  const actual = pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expectedHash, "hex"));
}

function validateCategoryPayload(input) {
  const name = sanitizeText(input.name, 40);
  const icon = sanitizeText(input.icon || "shapes", 40) || "shapes";
  const parentId = input.parentId ? Number(input.parentId) : null;

  if (!name) {
    return { error: "Category name is required." };
  }

  if (parentId) {
    const parent = db.prepare("SELECT id, parent_id FROM categories WHERE id = ?").get(parentId);
    if (!parent || parent.parent_id !== null) {
      return { error: "Sub-categories can only be created under a top-level category." };
    }
  }

  return { name, icon, parentId };
}

function validateAccountPayload(input) {
  const name = sanitizeText(input.name, 40);
  const last4 = sanitizeText(input.last4, 4);

  if (!name) {
    return { error: "Account name is required." };
  }

  if (last4 && !/^\d{4}$/.test(last4)) {
    return { error: "Last 4 digits must be exactly 4 digits when provided." };
  }

  const duplicate = db
    .prepare("SELECT id FROM accounts WHERE name = ? AND IFNULL(last4, '') = ?")
    .get(name, last4 || "");
  const currentId = input.id ? Number(input.id) : null;
  if (duplicate && duplicate.id !== currentId) {
    return { error: "An account with the same name and last 4 digits already exists." };
  }

  return { name, last4: last4 || null };
}

function validateTransactionPayload(input) {
  const txnType = ["debit", "credit", "transfer"].includes(input.txnType || input.txn_type)
    ? (input.txnType || input.txn_type)
    : null;
  const txnDate = sanitizeText(input.txnDate || input.txn_date, 10);
  const postedDateRaw = sanitizeText(input.postedDate || input.posted_date, 10);
  const postedDate = postedDateRaw || null;
  const amount = Number(input.amount);
  const categoryId = input.categoryId ? Number(input.categoryId) : null;
  const subcategoryId = input.subcategoryId ? Number(input.subcategoryId) : null;
  const accountId = input.accountId ? Number(input.accountId) : null;
  const description = sanitizeText(input.description, 120);
  const note = sanitizeText(input.note, 70);

  if (!txnType) {
    return { error: "Transaction type is required." };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(txnDate)) {
    return { error: "Date must be in YYYY-MM-DD format." };
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Amount must be greater than 0." };
  }

  if (note.length > 70) {
    return { error: "Note cannot be longer than 70 characters." };
  }

  if ((txnType === "debit" || txnType === "credit") && !categoryId) {
    return { error: "Category is required for debit and credit transactions." };
  }

  if (categoryId) {
    const category = db.prepare("SELECT id, parent_id FROM categories WHERE id = ?").get(categoryId);
    if (!category || category.parent_id !== null) {
      return { error: "Category must be a top-level category." };
    }
  }

  if (subcategoryId) {
    const subcategory = db.prepare("SELECT id, parent_id FROM categories WHERE id = ?").get(subcategoryId);
    if (!subcategory || !subcategory.parent_id || subcategory.parent_id !== categoryId) {
      return { error: "Sub-category must belong to the selected category." };
    }
  }

  if (accountId) {
    const account = db.prepare("SELECT id FROM accounts WHERE id = ?").get(accountId);
    if (!account) {
      return { error: "Selected account does not exist." };
    }
  }

  return {
    txnType,
    txnDate,
    postedDate,
    amount,
    categoryId,
    subcategoryId,
    accountId,
    description,
    note
  };
}

function detectNearDuplicate(payload, excludeId = null) {
  if (!payload.categoryId) {
    return { flag: "none", reference: "" };
  }

  const candidates = db.prepare(`
    SELECT id, amount
    FROM transactions
    WHERE txn_date = ?
      AND category_id = ?
      ${excludeId ? "AND id != ?" : ""}
    ORDER BY id DESC
  `);

  const rows = excludeId
    ? candidates.all(payload.txnDate, payload.categoryId, excludeId)
    : candidates.all(payload.txnDate, payload.categoryId);

  const match = rows.find((row) => Math.abs(Number(row.amount) - payload.amount) <= nearDuplicateTolerance);
  if (!match) {
    return { flag: "none", reference: "" };
  }

  return {
    flag: "near_duplicate",
    reference: `Possible overlap with transaction #${match.id}`
  };
}

function detectImportDuplicate(payload) {
  const existingRows = db.prepare(`
    SELECT
      t.id,
      t.amount,
      t.txn_date AS txnDate,
      t.txn_type AS txnType,
      t.description,
      t.account_id AS accountId,
      t.category_id AS categoryId
    FROM transactions t
    WHERE t.txn_date = ?
      AND t.txn_type = ?
  `).all(payload.txnDate, payload.txnType);

  const normalizedPayloadDescription = normalizeDescription(payload.description);

  for (const row of existingRows) {
    if (
      Number(row.amount) === Number(payload.amount) &&
      Number(row.accountId || 0) === Number(payload.accountId || 0) &&
      normalizeDescription(row.description) === normalizedPayloadDescription
    ) {
      return {
        status: "hard_duplicate",
        reference: `Duplicate of transaction #${row.id}`
      };
    }
  }

  if (payload.categoryId) {
    const near = existingRows.find((row) =>
      Number(row.categoryId || 0) === Number(payload.categoryId || 0) &&
      Math.abs(Number(row.amount) - Number(payload.amount)) <= nearDuplicateTolerance
    );

    if (near) {
      return {
        status: "near_duplicate",
        reference: `Possible overlap with transaction #${near.id}`
      };
    }
  }

  return { status: "none", reference: "" };
}

function buildImportPreviewRow(sourceRow, index) {
  const normalizedRow = normalizeImportRow(sourceRow);
  const categorySuggestion = suggestCategory(normalizedRow.description, normalizedRow.txnType);
  const accountSuggestion = suggestAccount(sourceRow, normalizedRow.description);
  const payload = {
    txnType: normalizedRow.txnType,
    txnDate: normalizedRow.txnDate,
    amount: normalizedRow.amount,
    categoryId: categorySuggestion.categoryId,
    subcategoryId: categorySuggestion.subcategoryId,
    accountId: accountSuggestion.accountId,
    description: normalizedRow.description,
    note: normalizedRow.note
  };
  const duplicateInfo = normalizedRow.txnDate && normalizedRow.amount
    ? detectImportDuplicate(payload)
    : { status: "none", reference: "" };

  return {
    rowIndex: index + 1,
    sourceSummary: normalizedRow.sourceSummary,
    txnType: normalizedRow.txnType,
    txnDate: normalizedRow.txnDate,
    amount: normalizedRow.amount,
    categoryId: categorySuggestion.categoryId,
    subcategoryId: categorySuggestion.subcategoryId,
    accountId: accountSuggestion.accountId,
    description: normalizedRow.description,
    note: normalizedRow.note,
    duplicateStatus: duplicateInfo.status,
    duplicateReference: duplicateInfo.reference,
    includeInImport: duplicateInfo.status !== "hard_duplicate",
    warnings: normalizedRow.warnings
  };
}

function summarizeImportPreview(rows) {
  return rows.reduce((summary, row) => {
    summary.total += 1;
    if (row.duplicateStatus === "hard_duplicate") {
      summary.hardDuplicates += 1;
    } else if (row.duplicateStatus === "near_duplicate") {
      summary.nearDuplicates += 1;
    }
    if (!row.categoryId) {
      summary.needsCategory += 1;
    }
    return summary;
  }, {
    total: 0,
    hardDuplicates: 0,
    nearDuplicates: 0,
    needsCategory: 0
  });
}

function normalizeImportRow(sourceRow) {
  const entries = Object.entries(sourceRow || {});
  const byKey = new Map(entries.map(([key, value]) => [normalizeHeader(key), String(value ?? "").trim()]));
  const allValues = entries.map(([, value]) => String(value ?? "").trim()).filter(Boolean);

  const txnDate = extractDateFromImport(byKey, allValues);
  const typeAmount = extractTypeAndAmount(byKey, allValues);
  const description = extractDescription(byKey, allValues);
  const note = sanitizeText(extractNote(byKey), 70);
  const sourceSummary = allValues.slice(0, 4).join(" | ").slice(0, 160);
  const warnings = [];

  if (!txnDate) {
    warnings.push("Could not confidently read the transaction date.");
  }
  if (!typeAmount.amount) {
    warnings.push("Could not confidently read the amount.");
  }
  if (!description) {
    warnings.push("Description was blank, so categorization may need manual review.");
  }

  return {
    txnDate: txnDate || "",
    txnType: typeAmount.txnType || "debit",
    amount: typeAmount.amount || 0,
    description: sanitizeText(description, 120),
    note,
    sourceSummary,
    warnings
  };
}

function normalizeHeader(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractDateFromImport(byKey, allValues) {
  const preferredKeys = [
    "date",
    "transaction date",
    "txn date",
    "posted date",
    "value date"
  ];

  for (const key of preferredKeys) {
    const parsed = parseFlexibleDate(byKey.get(key));
    if (parsed) {
      return parsed;
    }
  }

  for (const value of allValues) {
    const parsed = parseFlexibleDate(value);
    if (parsed) {
      return parsed;
    }
  }

  return "";
}

function parseFlexibleDate(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const normalized = raw.replace(/\./g, "/").replace(/-/g, "/");
  const match = normalized.match(/^(\d{1,4})\/(\d{1,2})\/(\d{1,4})$/);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const third = Number(match[3]);

    let year;
    let month;
    let day;

    if (String(first).length === 4) {
      year = first;
      month = second;
      day = third;
    } else if (String(third).length === 4) {
      year = third;
      if (first > 12) {
        day = first;
        month = second;
      } else {
        month = first;
        day = second;
      }
    }

    if (year && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const asDate = new Date(raw);
  if (!Number.isNaN(asDate.getTime())) {
    return localDateString(asDate);
  }

  return "";
}

function extractTypeAndAmount(byKey, allValues) {
  const debitKeys = ["debit", "withdrawal", "withdrawn", "paid", "money out"];
  const creditKeys = ["credit", "deposit", "received", "money in"];

  for (const key of debitKeys) {
    const value = byKey.get(key);
    const amount = parseAmount(value);
    if (amount > 0) {
      return { txnType: "debit", amount };
    }
  }

  for (const key of creditKeys) {
    const value = byKey.get(key);
    const amount = parseAmount(value);
    if (amount > 0) {
      return { txnType: "credit", amount };
    }
  }

  const drcr = normalizeHeader(byKey.get("type") || byKey.get("dr cr") || byKey.get("drcr"));
  const amountValue = parseAmount(
    byKey.get("amount") ||
    byKey.get("transaction amount") ||
    byKey.get("value")
  );

  if (amountValue > 0) {
    if (drcr.includes("cr") || drcr.includes("credit")) {
      return { txnType: "credit", amount: amountValue };
    }
    if (drcr.includes("dr") || drcr.includes("debit")) {
      return { txnType: "debit", amount: amountValue };
    }
    return { txnType: inferTypeFromValues(allValues), amount: amountValue };
  }

  for (const value of allValues) {
    const amount = parseAmount(value);
    if (amount > 0) {
      return { txnType: inferTypeFromValues(allValues), amount };
    }
  }

  return { txnType: inferTypeFromValues(allValues), amount: 0 };
}

function inferTypeFromValues(allValues) {
  const joined = allValues.join(" ").toLowerCase();
  if (/(salary|interest|refund|received|credit|deposit)/.test(joined)) {
    return "credit";
  }
  return "debit";
}

function parseAmount(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return 0;
  }

  const cleaned = raw
    .replace(/,/g, "")
    .replace(/₹/g, "")
    .replace(/[A-Za-z]/g, "")
    .replace(/\((.+)\)/, "-$1")
    .trim();

  const amount = Number(cleaned);
  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Math.abs(amount);
}

function extractDescription(byKey, allValues) {
  const preferredKeys = [
    "description",
    "narration",
    "remarks",
    "merchant",
    "details",
    "particulars",
    "transaction remarks",
    "upi id"
  ];

  for (const key of preferredKeys) {
    const value = sanitizeText(byKey.get(key), 120);
    if (value) {
      return value;
    }
  }

  return sanitizeText(allValues.find((value) => /[A-Za-z]{3,}/.test(value)) || "", 120);
}

function extractNote(byKey) {
  return byKey.get("note") || byKey.get("notes") || "";
}

function suggestCategory(description, txnType) {
  const topLevelCategories = fetchCategories();
  const categoryByName = new Map(topLevelCategories.map((category) => [category.name.toLowerCase(), category]));
  const text = normalizeDescription(description);

  if (txnType === "credit") {
    return { categoryId: categoryByName.get("income")?.id || null, subcategoryId: null };
  }

  const keywordMap = [
    { keywords: ["swiggy", "zomato", "cafe", "restaurant", "lunch", "dinner", "food"], category: "Food" },
    { keywords: ["grocery", "grofers", "blinkit", "instamart", "supermarket"], category: "Groceries" },
    { keywords: ["uber", "ola", "metro", "fuel", "petrol", "diesel", "transport"], category: "Transport" },
    { keywords: ["electricity", "bill", "broadband", "rent", "water"], category: "Bills" },
    { keywords: ["amazon", "flipkart", "mall", "shopping"], category: "Shopping" },
    { keywords: ["pharmacy", "clinic", "hospital", "medic"], category: "Health" },
    { keywords: ["netflix", "spotify", "movie", "bookmyshow"], category: "Entertainment" },
    { keywords: ["flight", "hotel", "travel", "airbnb"], category: "Travel" },
    { keywords: ["transfer", "self transfer"], category: "Transfers" }
  ];

  const match = keywordMap.find((entry) => entry.keywords.some((keyword) => text.includes(keyword)));
  return {
    categoryId: match ? categoryByName.get(match.category.toLowerCase())?.id || null : categoryByName.get("miscellaneous")?.id || null,
    subcategoryId: null
  };
}

function suggestAccount(sourceRow, description) {
  const sourceText = `${Object.values(sourceRow || {}).join(" ")} ${description}`.trim();
  const last4Match = sourceText.match(/(\d{4})(?!.*\d)/);
  if (!last4Match) {
    return { accountId: null };
  }

  const account = db.prepare("SELECT id FROM accounts WHERE last4 = ? LIMIT 1").get(last4Match[1]);
  return { accountId: account?.id || null };
}

function normalizeDescription(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fetchCategories() {
  const rows = db.prepare(`
    SELECT id, name, icon, parent_id AS parentId, created_at AS createdAt, updated_at AS updatedAt
    FROM categories
    ORDER BY COALESCE(parent_id, id), parent_id IS NOT NULL, name COLLATE NOCASE ASC
  `).all();

  const parents = [];
  const byParent = new Map();

  for (const row of rows) {
    if (row.parentId === null) {
      parents.push({ ...row, subcategories: [] });
    } else {
      const list = byParent.get(row.parentId) || [];
      list.push(row);
      byParent.set(row.parentId, list);
    }
  }

  for (const parent of parents) {
    parent.subcategories = byParent.get(parent.id) || [];
  }

  return parents;
}

function fetchTransactionById(id) {
  return db.prepare(`
    SELECT
      t.id,
      t.txn_type AS txnType,
      t.txn_date AS txnDate,
      t.posted_date AS postedDate,
      t.amount,
      t.description,
      t.note,
      t.duplicate_flag AS duplicateFlag,
      t.duplicate_reference AS duplicateReference,
      c.id AS categoryId,
      c.name AS categoryName,
      s.id AS subcategoryId,
      s.name AS subcategoryName,
      a.id AS accountId,
      CASE
        WHEN a.last4 IS NOT NULL AND a.last4 != '' THEN a.name || ' (' || a.last4 || ')'
        WHEN a.name IS NOT NULL THEN a.name
        ELSE ''
      END AS accountDisplay
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN categories s ON s.id = t.subcategory_id
    LEFT JOIN accounts a ON a.id = t.account_id
    WHERE t.id = ?
  `).get(id);
}

function fetchTransactions(searchParams) {
  const filters = {
    startDate: searchParams.get("startDate") || defaultStartDate(),
    endDate: searchParams.get("endDate") || defaultEndDate(),
    categoryId: searchParams.get("categoryId") || "",
    subcategoryId: searchParams.get("subcategoryId") || "",
    txnType: searchParams.get("txnType") || "all",
    accountId: searchParams.get("accountId") || "",
    query: (searchParams.get("query") || "").trim()
  };

  const conditions = ["t.txn_date BETWEEN ? AND ?"];
  const params = [filters.startDate, filters.endDate];

  if (filters.categoryId) {
    conditions.push("t.category_id = ?");
    params.push(Number(filters.categoryId));
  }

  if (filters.subcategoryId) {
    conditions.push("t.subcategory_id = ?");
    params.push(Number(filters.subcategoryId));
  }

  if (filters.txnType && filters.txnType !== "all") {
    conditions.push("t.txn_type = ?");
    params.push(filters.txnType);
  }

  if (filters.accountId) {
    conditions.push("t.account_id = ?");
    params.push(Number(filters.accountId));
  }

  if (filters.query) {
    conditions.push("(LOWER(t.note) LIKE ? OR LOWER(t.description) LIKE ?)");
    params.push(`%${filters.query.toLowerCase()}%`, `%${filters.query.toLowerCase()}%`);
  }

  const statement = db.prepare(`
    SELECT
      t.id,
      t.txn_type AS txnType,
      t.txn_date AS txnDate,
      t.posted_date AS postedDate,
      t.amount,
      t.description,
      t.note,
      t.duplicate_flag AS duplicateFlag,
      t.duplicate_reference AS duplicateReference,
      c.id AS categoryId,
      c.name AS categoryName,
      s.id AS subcategoryId,
      s.name AS subcategoryName,
      a.id AS accountId,
      CASE
        WHEN a.last4 IS NOT NULL AND a.last4 != '' THEN a.name || ' (' || a.last4 || ')'
        WHEN a.name IS NOT NULL THEN a.name
        ELSE ''
      END AS accountDisplay
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN categories s ON s.id = t.subcategory_id
    LEFT JOIN accounts a ON a.id = t.account_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY t.txn_date DESC, t.id DESC
  `);

  const transactions = statement.all(...params);
  return {
    filters,
    transactions,
    summary: buildSummary(transactions)
  };
}

function fetchHomeData() {
  const startDate = monthStartDate();
  const endDate = monthEndDate();
  const monthTransactions = db.prepare(`
    SELECT
      t.id,
      t.txn_type AS txnType,
      t.txn_date AS txnDate,
      t.posted_date AS postedDate,
      t.amount,
      t.description,
      t.note,
      t.duplicate_flag AS duplicateFlag,
      t.duplicate_reference AS duplicateReference,
      c.id AS categoryId,
      c.name AS categoryName,
      s.id AS subcategoryId,
      s.name AS subcategoryName,
      a.id AS accountId,
      CASE
        WHEN a.last4 IS NOT NULL AND a.last4 != '' THEN a.name || ' (' || a.last4 || ')'
        WHEN a.name IS NOT NULL THEN a.name
        ELSE ''
      END AS accountDisplay
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN categories s ON s.id = t.subcategory_id
    LEFT JOIN accounts a ON a.id = t.account_id
    WHERE t.txn_date BETWEEN ? AND ?
    ORDER BY t.txn_date DESC, t.id DESC
  `).all(startDate, endDate);

  const recentTransactions = db.prepare(`
    SELECT
      t.id,
      t.txn_type AS txnType,
      t.txn_date AS txnDate,
      t.amount,
      t.description,
      t.note,
      c.name AS categoryName,
      s.name AS subcategoryName,
      CASE
        WHEN a.last4 IS NOT NULL AND a.last4 != '' THEN a.name || ' (' || a.last4 || ')'
        WHEN a.name IS NOT NULL THEN a.name
        ELSE ''
      END AS accountDisplay
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN categories s ON s.id = t.subcategory_id
    LEFT JOIN accounts a ON a.id = t.account_id
    ORDER BY t.txn_date DESC, t.id DESC
    LIMIT 5
  `).all();

  const categoryBreakdown = buildCategoryBreakdown(monthTransactions);

  return {
    month: {
      startDate,
      endDate,
      label: formatMonthLabel(startDate)
    },
    summary: buildSummary(monthTransactions),
    categoryBreakdown,
    recentTransactions
  };
}

function buildSummary(transactions) {
  const summary = {
    debit: 0,
    credit: 0,
    transfer: 0,
    count: transactions.length
  };

  for (const txn of transactions) {
    summary[txn.txnType] += Number(txn.amount);
  }

  return summary;
}

function buildCategoryBreakdown(transactions) {
  const totals = new Map();
  for (const txn of transactions) {
    if (txn.txnType !== "debit") {
      continue;
    }
    const key = txn.categoryName || "Uncategorized";
    totals.set(key, (totals.get(key) || 0) + Number(txn.amount));
  }

  return [...totals.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((left, right) => right.amount - left.amount);
}

function defaultStartDate() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
  return toDateInputValue(start);
}

function monthStartDate() {
  const now = new Date();
  return localDateString(new Date(now.getFullYear(), now.getMonth(), 1));
}

function monthEndDate() {
  const now = new Date();
  return localDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0));
}

function formatMonthLabel(isoDate) {
  const date = new Date(`${isoDate}T12:00:00`);
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(date);
}

function defaultEndDate() {
  return toDateInputValue(new Date());
}

function toDateInputValue(date) {
  return localDateString(date);
}

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function csvEscape(value) {
  const stringValue = String(value ?? "");
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replaceAll('"', '""')}"`;
  }
  return stringValue;
}

function isSqliteConstraintError(error) {
  return Boolean(error && typeof error.code === "string" && error.code.includes("SQLITE_CONSTRAINT"));
}
