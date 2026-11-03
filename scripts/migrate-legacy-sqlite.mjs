// Converts data from the old Node + SQLite version (data/app.db) into a sync
// file the new app can merge: Settings › Sync & backup › Choose file.
//
//   node scripts/migrate-legacy-sqlite.mjs [data/app.db] [legacy-import.json]
//
// Mapping:
//   debit -> expense, credit -> income, transfer -> transfer
//   starter categories -> the matching new starter categories
//   other categories -> new categories; sub-categories become their own
//   category named "Sub (Parent)"
//   description and note -> note
//   all amounts are INR (the old version had no currencies)

import { DatabaseSync } from "node:sqlite";
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { buildSyncFile } from "../app/js/sync.js";
import { CATEGORY_COLORS } from "../app/js/defaults.js";
import { DEFAULT_CURRENCIES } from "../app/js/money.js";

const [dbPath = "data/app.db", outPath = "legacy-import.json"] = process.argv.slice(2);
if (!existsSync(dbPath)) {
  console.error(`No database at ${dbPath}. Pass the path to the old app.db.`);
  process.exit(1);
}

const db = new DatabaseSync(dbPath, { readOnly: true });
const now = Date.now();
const ts = (s) => (s ? Date.parse(`${String(s).replace(" ", "T")}Z`) || now : now);

const SEED_MAP = {
  food: "cat-food", groceries: "cat-groceries", transport: "cat-transport", bills: "cat-bills",
  shopping: "cat-shopping", health: "cat-health", entertainment: "cat-fun", travel: "cat-travel",
  income: "cat-other-income", miscellaneous: "cat-misc", transfers: null
};
const EMOJI = {
  "fork-knife": "🍜", basket: "🛒", car: "🚕", receipt: "🧾", bag: "🛍️", "heart-pulse": "💊",
  film: "🎬", plane: "✈️", wallet: "💰", "arrows-left-right": "⇄", shapes: "📦"
};

const rows = db.prepare("SELECT id, name, icon, parent_id FROM categories").all();
const byId = new Map(rows.map((r) => [r.id, r]));
const catIdFor = new Map();
const categories = [];
let order = 100;
for (const r of rows) {
  const parent = r.parent_id ? byId.get(r.parent_id) : null;
  const seed = !parent ? SEED_MAP[r.name.toLowerCase()] : undefined;
  if (seed !== undefined) { catIdFor.set(r.id, seed); continue; }
  const id = `cat-legacy-${r.id}`;
  const kindSource = (parent || r).name.toLowerCase();
  catIdFor.set(r.id, id);
  categories.push({
    id,
    name: parent ? `${r.name} (${parent.name})` : r.name,
    emoji: EMOJI[r.icon] || "📦",
    color: CATEGORY_COLORS[order % CATEGORY_COLORS.length],
    kind: kindSource === "income" ? "income" : "expense",
    budget: null,
    order: order++,
    archived: false,
    createdAt: now,
    updatedAt: now
  });
}

const accounts = db.prepare("SELECT id, name, last4, created_at FROM accounts").all().map((a, i) => ({
  id: `acc-legacy-${a.id}`,
  name: a.name,
  last4: a.last4 || "",
  kind: /cash/i.test(a.name) ? "cash" : "bank",
  archived: false,
  order: i + 1,
  createdAt: ts(a.created_at),
  updatedAt: now
}));

const inr = DEFAULT_CURRENCIES.find((c) => c.code === "INR");
const TYPE = { debit: "expense", credit: "income", transfer: "transfer" };
const transactions = db.prepare("SELECT * FROM transactions").all().map((t) => {
  const description = String(t.description || "").trim();
  const extra = String(t.note || "").trim();
  const note = [description, extra].filter(Boolean).join(" – ").slice(0, 80);
  const type = TYPE[t.txn_type] || "expense";
  return {
    id: `txn-legacy-${t.id}`,
    type,
    date: t.txn_date,
    amount: Number(t.amount),
    currency: "INR",
    rateUSD: inr.toUSD,
    rateINR: 1,
    categoryId: type === "transfer" ? null : catIdFor.get(t.subcategory_id) || catIdFor.get(t.category_id) || null,
    accountId: t.account_id ? `acc-legacy-${t.account_id}` : null,
    toAccountId: null,
    note,
    recurringId: null,
    flag: t.duplicate_flag === "near_duplicate" ? "near_duplicate" : "none",
    createdAt: ts(t.created_at),
    updatedAt: now
  };
});

const text = buildSyncFile({ transactions, categories, accounts, currencies: [], recurring: [], prefs: [] }, { deviceName: "Old desktop app" });
await writeFile(outPath, text);
console.log(`Wrote ${outPath}: ${transactions.length} transactions, ${categories.length} extra categories, ${accounts.length} accounts.`);
console.log("Open the new app, go to Settings › Sync & backup, and choose this file to merge it in.");
