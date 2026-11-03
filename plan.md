# Plan

What's been built, what's next, and why it's built this way. Keep this file updated as work lands.

## The brief (November 2026 rescope)

- Lives on **iPhone and MacBook**.
- Doesn't need instant sync. Data can live in **iCloud Drive or Google Drive**, with no preference between them.
- **Analyse at month end** (or any time): spending by category, basic charts, and suggestions for where to save.
- **Easy data entry.**
- **Custom categories**, and **multiple currencies** with user-set rates against **USD and INR, set separately**.
- Google Pay / statement import is **not needed now**, but is a possible extension.
- Clean but inviting design: no clutter, easy to use.

### What changed from the original plan

| Original (v1 README) | Now | Why |
|---|---|---|
| Local Node.js server + SQLite on a laptop | Static installable web app (PWA) + IndexedDB on each device | An iPhone can't run a Node server. A PWA runs on both devices from one codebase, works offline, and needs no App Store or developer account. |
| Single local username/password | Optional passcode lock per device | No server means no login to protect. A device lock fits a personal phone better. |
| Mobile app out of scope | iPhone is a primary target | Brief changed. |
| Multi-currency out of scope | Any currency, with separate USD and INR rates | Brief changed. |
| CSV/PDF statement import in V1 | Deferred (see *Next*) | Brief: not needed now. The old parsing code is kept in git history for later. |
| Debit / credit / transfer | Expense / income / transfer | Plainer words. Same meaning; the migration maps them. |
| Sub-categories (one level) | Flat categories for now | Keeps entry to one tap. Sub-categories migrate as "Sub (Parent)". Revisit if wanted (see *Next*). |
| Formatted PDF export | CSV export now; printable report later | Insights covers the analysis; a print view is cheap to add later. |

### Key decisions

1. **PWA over a native app.** One codebase for iPhone and Mac, no Xcode, no $99/year developer account, and updates ship by pushing to GitHub. The trade-offs: iOS PWAs can't write directly to iCloud Drive, and there are no widgets or Siri. If those become important, wrap the same code with Capacitor (see *Later*).
2. **File-based sync through iCloud Drive or Google Drive.** Both appear in the iPhone Files app and in Finder on the Mac, so a single JSON file works with either and nothing has to be chosen up front. There's no OAuth, no API keys and no server, and it works offline. The cost is two taps on iPhone (pick file, save file) instead of automatic sync, which fits "need not sync immediately".
3. **Record-level, last-write-wins merge with tombstones.** It's simple and safe for one person on two devices: idempotent and order-independent, so merging an old file can't do damage. Covered by unit and end-to-end tests.
4. **Rate snapshots on each transaction.** Changing a rate later doesn't rewrite history unless you ask it to.
5. **No framework and no build step.** It's small, fast on a phone, has no dependency churn, and any file can be edited and pushed.
6. **Insights compare like with like.** Category changes are measured against what you'd usually have spent *by the same day of the month*, and projections count regular bills once instead of extrapolating them, so rent on the 2nd isn't reported as a 900% spike.

---

## Done

### v1 (before the rescope)
- [x] Blueprint README: scope, data model, import pipeline, dedupe rules
- [x] Node + SQLite server, local login, starter categories, accounts
- [x] Manual entry and editing, filterable dashboard, near-duplicate flags, CSV export
- [x] CSV import preview/commit, early PDF text parsing (needed a local `pdftotext`)

### v2: PWA rescope (this change)
**Platform**
- [x] Static PWA in `app/`: manifest, icons (SVG + iOS/Android PNGs), service worker with offline cache and update prompt
- [x] IndexedDB storage; asks the browser to persist data; in-memory store for instant screens
- [x] Layout for iPhone (bottom tabs, central add button, safe areas) and Mac (sidebar, keyboard shortcuts)
- [x] Light and dark mode; reduced motion; 16px inputs to stop iOS zoom
- [x] Hint to add the app to the Home Screen on iPhone (avoids Safari storage eviction)

**Entry**
- [x] Add/edit sheet: expense, income or transfer; big amount field with `+ − ×` maths; categories by usage; note autocomplete that remembers category and account; Today/Yesterday/date; account; currency with live conversion
- [x] Near-duplicate warning before saving; flag clearing for migrated flags
- [x] Undo after add and delete; *Copy as new*
- [x] Repeating entries (weekly, monthly, quarterly, yearly) with month-end clamping, pause, end date and edits; back-fills on open; sync-safe ids

**Organise**
- [x] Custom categories: emoji, colour, kind, monthly budget with a suggestion from history, hide, delete
- [x] Accounts: type, last 4, hide, delete-protection when in use
- [x] Currencies: 20 presets or custom; separate USD and INR rates; per-transaction snapshots; optional re-apply to past entries
- [x] Preferences: overall monthly budget, default entry currency, report currency (INR/USD), duplicate tolerance, device name

**Review**
- [x] Home: month total, category ribbon with pace marker, budget left and days to go, budget bars, recent entries, sync reminder
- [x] Activity: grouped by day with daily net, search, month/type/category/account filters, CSV export with INR and USD columns
- [x] Insights, month or year: summary vs last period; suggestions (budget pace with regular bills counted once, category spikes vs the same point last month, frequent small spends, one-off purchases, subscriptions, budget suggestions, savings rate); donut, pace line, 12-month bars, weekday habits; regular charges, biggest expenses, most frequent

**Data**
- [x] Sync & backup screen: merge one or more files, save via the share sheet (iPhone) or download; one-click linked file in Chrome (File System Access API); status and changes since last save
- [x] Optional passcode lock (PBKDF2), re-locks after 5 minutes away, forgot-passcode reset
- [x] Erase data on this device
- [x] `scripts/migrate-legacy-sqlite.mjs` to bring v1 data across

**Quality**
- [x] 15 unit tests: amount maths, conversion, formatting, merge properties, sync file validation, recurrence, totals, breakdowns, subscription detection, insight rules (incl. the rent-early-in-month regression), duplicates
- [x] End-to-end browser test: entry, duplicate warning, repeating rent, delete/undo, two-device sync round trip (edit + delete + new), idempotent re-merge, bad-file rejection, EUR snapshot, passcode
- [x] Offline reload verified; screenshots checked at iPhone and 1440px Mac sizes in light and dark
- [x] GitHub Actions workflow: tests, then deploy `app/` to GitHub Pages

---

## Next

In rough priority order.

### 1. Get it onto your devices (you)
- [ ] Turn on GitHub Pages: repo **Settings › Pages › Source: GitHub Actions**, then merge to `main`.
- [ ] Install on iPhone (Safari › Share › Add to Home Screen) and Mac (Safari › File › Add to Dock, or Chrome install).
- [ ] Set real exchange rates under Settings › Currencies. The starting INR↔USD rates are placeholders.
- [ ] Create `Finances/finance-sync.json` in iCloud Drive or Google Drive with a first *Save file*.
- [ ] If you have data in the old version: `npm run migrate-legacy -- data/app.db` and merge the output.

### 2. After a month of real use
- [ ] Tune the insight thresholds (spike %, minimum share, frequent-purchase count) against real data.
- [ ] Check that sync is low-friction enough on iPhone. If not, consider #6 (direct Google Drive sync).
- [ ] Decide whether sub-categories or tags are wanted (see #4).

### 3. Small, high-value additions
- [ ] **Printable monthly report**: a print stylesheet for Insights, giving "Save as PDF" on Mac and iPhone (replaces the old formatted PDF export).
- [ ] **Account balances**: opening balance per account and running balance, including transfers.
- [ ] **Budget rollover**: carry unspent budget into next month, per category, optionally.
- [ ] **Quick-add from a link**: `#/add?amount=250&cat=food&note=Swiggy` to prefill the sheet, for bookmarks or iOS Shortcuts.
- [ ] **Encrypted sync file**: an optional passphrase (AES-GCM via WebCrypto), since the file sits in a cloud drive.
- [ ] **Sync-file pruning**: drop tombstones older than a year to keep the file small.

### 4. Organisation
- [ ] Tags (e.g. `#goa-trip`) across categories, with a tag filter and insight.
- [ ] Optional sub-categories, if tags don't cover it.
- [ ] Reorder categories by drag (order currently follows usage on the add screen).
- [ ] Savings goals with progress.

### 5. Importing (deferred extension)
The v1 server had working pieces in git history (`server.mjs` at commit `5269630`): `parseFlexibleDate`, `parseAmount`, `normalizeImportRow`, `extractTypeAndAmount`, `suggestCategory`, and the hard/near-duplicate rules. Plan:
- [ ] Move the CSV parser and normalisers into a client-side `app/js/import/` module with source adapters (`bank-csv`, `gpay-csv`).
- [ ] Review screen: edit, include/exclude, duplicate status per row, then save the selected rows (the flow from the v1 README).
- [ ] Keyword → category rules, learnt from your own past notes (the `noteMemory` the add sheet already uses) plus editable rules.
- [ ] Google Pay statement PDFs via pdf.js text extraction (text-based PDFs only).

### 6. Later / if needed
- [ ] **Direct Google Drive sync** (OAuth, Drive `appDataFolder`), making sync automatic and one tap on iPhone. Needs a Google Cloud OAuth client tied to the Pages domain.
- [ ] **Native wrapper with Capacitor** if PWA limits bite: home-screen widgets, Siri/Shortcuts, Face ID, real iCloud Drive file access. Reuses all of `app/`.
- [ ] **Exchange-rate helper**: optionally fetch a reference rate to compare with your own (your rates stay the source of truth).

---

## Known limitations

- **iPhone sync is two taps** (merge, then save via the share sheet). iOS web apps can't keep a writable link to a file.
- **Safari on Mac downloads** the sync file instead of overwriting it. Move it into the sync folder, or use Chrome's one-click linked file.
- **The passcode is a lock, not encryption.** Anyone with the unlocked device or the sync file can read the data.
- **Storage is per browser.** Safari and Chrome on the same Mac are separate copies, so pick one.
- **Clearing website data** in iPhone settings erases the app's data. Your sync file is the backup.
