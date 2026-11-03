# Finance Tracker

A private personal finance tracker that lives on your **iPhone** and **MacBook**. Log spending in a couple of taps, then review the month: where the money went, how it compares with usual, and where you could save.

- **Works offline.** It's an installable web app (PWA). Once opened, it runs without a connection.
- **Your data stays with you.** Everything is stored on the device. There is no server and no account.
- **Syncs when you want.** Devices share data through one file in iCloud Drive or Google Drive. Sync daily, weekly or once at the end of the month.
- **Any currency.** Add currencies and set each one's rate to USD and to INR separately. Totals can be shown in rupees or dollars.

See [plan.md](plan.md) for what's done, what's next, and the reasoning behind the design.

---

## Using it

### Install on iPhone

1. Open the app's address in **Safari** (see [Hosting](#hosting)).
2. Tap **Share › Add to Home Screen**.
3. Open it from the Home Screen icon from now on.

Use the Home Screen app, not a Safari tab. Safari can clear storage for websites you haven't visited in a while; Home Screen apps keep their data.

### Install on Mac

- **Safari** (macOS Sonoma or later): **File › Add to Dock**.
- **Chrome**: click the install icon in the address bar. Chrome also supports one-click sync to a linked file.

### Sync between iPhone and Mac

Each device keeps a full copy of your data. To bring them in step, open **Settings › Sync & backup**:

1. **Merge in the latest file**: pick `finance-sync.json` from iCloud Drive or Google Drive.
2. **Save the updated file**: save it back to the same folder. On iPhone, choose *Save to Files › Replace*.

Do this on one device, then the other. Each record keeps its most recent edit, and deletions carry across. Merging is always safe: merging the same file twice, or several old copies, never duplicates or loses anything.

In Chrome on the Mac you can **link** the file once, and then sync is a single click.

*Set-up tip:* make a folder called `Finances` in iCloud Drive. For Google Drive on iPhone, enable it under *Files › Browse › ⋯ › Edit*. On Mac, use Google Drive for desktop.

### Keyboard shortcuts (Mac)

`N` add a transaction, `/` search, `1`–`4` switch screens, `Esc` close a sheet.

---

## Features

**Fast entry**
- One sheet for expenses, income and transfers, with a big amount field and a category grid ordered by what you use most.
- Type sums straight into the amount: `120+45`, `3*250`.
- Notes autocomplete from past entries and fill in the category you used last time ("Swiggy" → Food).
- Today / Yesterday / any date, optional account, any currency.
- Warns if a same-day entry in the same category has nearly the same amount (likely duplicate). The tolerance is adjustable.
- Undo after adding or deleting.

**Repeating entries**: rent, salary and subscriptions are logged automatically on their due day (weekly, monthly, quarterly or yearly). They can be paused, ended or edited.

**Categories & budgets**
- Custom categories with an emoji and colour, for spending or income.
- Optional monthly budget per category and overall, in INR or USD.
- Hide categories you no longer use, without touching past entries.

**Accounts** (optional): bank accounts, cards, cash and wallets, with last 4 digits. Transfers between them don't count as spending.

**Currencies**
- INR and USD built in. Add any other currency (20 common ones are preset).
- For each currency, set *1 unit = x USD* and *1 unit = y INR* independently.
- Each transaction stores the rates in effect when it was added, so changing a rate doesn't silently rewrite past months. You can choose to re-apply new rates to existing entries.

**Home**: this month's spending as one big number, a colour ribbon by category, the budget left and days to go, budget progress bars, and recent entries.

**Activity**: every entry grouped by day, with search (notes, categories, amounts), filters by month, type, category and account, and CSV export (with INR and USD columns).

**Insights** (month or year, in INR or USD)
- Spent, income, kept, and savings rate, compared with last period.
- **Worth a look**: plain-language observations and suggestions, for example:
  - over budget, or a category running ahead of its budget;
  - a projected month-end total (regular bills counted once, day-to-day spending extrapolated) with a daily allowance to stay on track;
  - categories up sharply against what you'd usually have spent *by the same day of the month*;
  - frequent small purchases that add up;
  - a single purchase dominating the month;
  - regular charges and subscriptions, and their monthly total;
  - suggested budgets based on the last 3 months.
- Charts: category donut, cumulative spending through the month against last month and budget, 12-month income vs spending, and day-of-week habits.
- Lists: regular charges detected, biggest expenses, most frequent merchants.

**Privacy**: an optional 4–6 digit passcode lock that re-locks after 5 minutes in the background. It is a lock, not encryption.

**Looks**: a clean, native-feeling design for iPhone and Mac, with light and dark mode, safe-area aware, and reduced-motion respected.

---

## How it works

```
app/                      the whole app: static files, no build step
  index.html              shell
  manifest.webmanifest    install metadata
  sw.js                   service worker (offline cache)
  css/styles.css
  icons/
  js/
    main.js               boot, routing, navigation, shortcuts
    store.js              in-memory state + persistence
    db.js                 IndexedDB wrapper
    sync.js               sync-file format and merge
    recurring.js          repeating-entry schedule
    analytics.js          totals, trends, projections, insights
    money.js              currencies, conversion, formatting, amount maths
    charts.js             SVG charts
    defaults.js           starter categories and currencies
    ui/                   one module per screen, plus shared helpers
scripts/
  dev-server.mjs          local static server
  make-icons.mjs          renders the PNG icons from icons/icon.svg
  migrate-legacy-sqlite.mjs  converts data from the old SQLite version
tests/
  logic.test.mjs          unit tests (node:test)
  e2e.mjs                 browser tests of the main flows, incl. two-device sync
```

Plain ES modules with no framework or dependencies keep the app small, fast to load on a phone, and easy to maintain. The logic modules (`sync`, `analytics`, `money`, `recurring`, `util`) don't touch the DOM, so they're unit-tested in Node.

### Data model

Every record has a string `id`, `createdAt` and `updatedAt`. A deleted record becomes a tombstone `{ id, deleted: true, updatedAt }` so the deletion syncs.

| Collection | Key fields |
|---|---|
| `transactions` | `type` (expense / income / transfer), `date`, `amount`, `currency`, `rateUSD`, `rateINR` (snapshot), `categoryId`, `accountId`, `toAccountId`, `note`, `recurringId`, `flag` |
| `categories` | `name`, `emoji`, `color`, `kind` (expense / income), `budget {amount, currency}`, `order`, `archived` |
| `accounts` | `name`, `last4`, `kind`, `archived` |
| `currencies` | `code` (also the id), `name`, `symbol`, `toUSD`, `toINR` |
| `recurring` | the transaction template plus `frequency`, `startDate`, `endDate`, `paused` |
| `prefs` | `defaultCurrency`, `reportCurrency`, `monthlyBudget`, `nearDupTolerance` |

Device-only settings (passcode, last sync time, linked sync file, device name) live in a separate store and are never synced.

**Sync merge**: per record, the later `updatedAt` wins; on a tie, deletion wins, then a deterministic comparison. Starter data has fixed ids and `updatedAt: 0`, so two fresh devices merge cleanly and any real edit wins. Repeating entries get deterministic ids (`rec-<rule>-<date>`), so two devices generating the same occurrence produce one record, and a deleted occurrence is never re-created.

---

## Development

Requires Node 22 or later (for the dev server, tests and scripts; the app itself needs nothing).

```bash
npm start            # http://localhost:5173
npm test             # unit tests
npm run test:e2e     # browser tests (needs Playwright; run with the dev server up)
npm run icons        # regenerate PNG icons from app/icons/icon.svg
```

When you change files in `app/`, bump `VERSION` in `app/sw.js` so installed copies pick up the update. The app then shows a *Reload* prompt.

### Hosting

A phone only installs and runs a web app offline when it's served over HTTPS, so the app is published with **GitHub Pages**:

1. In the repo, go to **Settings › Pages › Build and deployment › Source** and choose **GitHub Actions**.
2. Push to `main`. The workflow in `.github/workflows/pages.yml` runs the tests and publishes `app/`.
3. The app is then at `https://<your-username>.github.io/personal-finance-tracker/`.

This only hosts the app's code. Your financial data never goes to GitHub; it stays in each device's storage and your sync file. If the repository is public, the code is public too (which is fine), but don't commit sync files (`.gitignore` excludes them).

### Coming from the old SQLite version

The first version was a local Node + SQLite server. It's been replaced, because an iPhone can't run it. To bring old data across:

```bash
npm run migrate-legacy -- path/to/data/app.db legacy-import.json
```

Then in the app: **Settings › Sync & backup › Choose file** and pick `legacy-import.json`. Debits and credits become expenses and income, starter categories map onto the new ones, sub-categories become categories named "Sub (Parent)", and description and note are combined into the note.

---

## Principles

- Fast to enter, calm to read. Few screens, no clutter, numbers first.
- Your data, on your devices. No accounts, no tracking, no external services.
- Suggestions are plain, specific and editable. No hidden automation.
- Simple deterministic rules over cleverness, so the numbers can be trusted.
- No build step and no dependencies, so it's easy to keep working for years.
