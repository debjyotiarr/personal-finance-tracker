# FinanceTracker

FinanceTracker is a local-first personal expense tracker designed for single-user use on a laptop or desktop. It helps track expenses, credits, and transfers; manage categories and sub-categories; import transactions from bank and Google Pay statements; review and deduplicate imported entries; and export filtered reports as CSV or PDF.

The initial release is intended to run as a local web app in the browser. The architecture should make it straightforward to package later as a desktop app without a major rewrite.

## Goals

- Keep all data stored locally on the user's machine
- Make daily transaction entry fast and readable
- Support manual entry and bulk imports
- Allow review and correction of imported transactions before saving
- Keep categorization editable at all times
- Provide reliable filtering and reporting
- Keep the codebase easy to maintain

## Product Scope

### In Scope for V1

- Single local user account with username and password
- Local-only storage
- Manual transaction entry
- Category and sub-category management
- Account management using friendly names and last 4 digits
- Dashboard with filters and editable transaction rows
- CSV and text-based PDF import
- Import review screen
- Duplicate and near-duplicate detection
- CSV export
- Formatted PDF export

### Out of Scope for V1

- Cloud sync
- Multi-user support
- Mobile app
- Multi-currency support
- Screenshot-based import
- OCR for scanned PDFs
- External AI services

## Recommended Technical Direction

### Why SQLite Instead of JSON/CSV

Although JSON or CSV files are simpler to inspect directly, SQLite is the better choice for this app because it still stores data locally in a single file while making the following much easier:

- Fast filtering across large date ranges
- Safe editing of individual transactions
- Deduplication and import review workflows
- Category/account relationships
- Reliable exports and reporting
- Future migration to desktop packaging

CSV should still be supported as an import and export format, but SQLite should be the primary storage layer.

### Suggested Stack

- Frontend: React
- Styling: a lightweight CSS approach or component library focused on readability
- Backend: local Node.js server
- Database: SQLite
- ORM or query builder: SQLite-friendly layer for migrations and typed queries
- CSV import: robust parser
- PDF import: text extraction for text-based PDFs
- PDF export: server-side document generation
- Authentication: local hashed password and local session storage

### Deployment Shape

#### V1

- Run locally in browser
- Local backend process
- Local SQLite database file

#### Later

- Wrap the same codebase as a desktop app

## Core Functional Requirements

### 1. Manual Transaction Entry

The user should be able to add a transaction as either:

- Debit
- Credit
- Transfer

Each transaction should capture:

- Date
- Amount
- Category
- Sub-category, if present
- Account, if present
- Brief note, optional

Rules:

- Note is optional
- Note maximum length is 70 characters
- Amount must be positive
- Transaction type determines how the amount is interpreted
- Category is required for debit and credit
- Transfer can use a dedicated transfer category or transfer type handling

### 2. Categories and Sub-Categories

The user should be able to:

- View categories
- Create categories
- Edit categories
- Create sub-categories one level deep only
- Assign a logo to each category

Rules:

- Maximum 50 top-level categories
- Each category must have a name
- Each category must have a logo
- A default logo is always available
- User can choose from built-in icons
- User can optionally upload a custom image up to 300 KB
- Only one sub-category level is supported

Suggested starter categories:

- Food
- Groceries
- Transport
- Bills
- Shopping
- Health
- Entertainment
- Travel
- Income
- Transfers
- Miscellaneous

### 3. Accounts

Transactions may optionally be linked to an account.

Account examples:

- HDFC 1234
- SBI 5678
- Cash

Rules:

- User can create named accounts
- Last 4 digits may be stored when relevant
- Cash-style accounts may exist without last 4 digits
- Transfers should be editable like any other transaction

### 4. Dashboard and Reporting

The main dashboard should display transactions in a tabular form.

Default filters:

- Date range: last 1 month
- Category: all categories
- Type: both debit and credit
- Account: all accounts

Available filters:

- Start date
- End date
- Category
- Sub-category
- Transaction type
- Account
- Text search on note or description

Capabilities:

- Edit transactions from the table
- Sort by date, amount, or category
- View debit, credit, and transfer entries
- Export current filtered results as CSV
- Export current filtered results as formatted PDF

### 5. Importing Statements

The app should allow uploading:

- Bank CSV files
- Bank PDF files
- Google Pay CSV exports, if available
- Google Pay PDF exports

V1 import assumptions:

- CSV imports should be treated as reliable first-class input
- PDF imports should support text-based PDFs only
- Image-based PDFs and screenshots are deferred

The import pipeline should:

1. Upload file
2. Detect source type when possible
3. Parse transactions from file
4. Infer whether each row is a debit, credit, or transfer
5. Generate a short normalized description
6. Suggest category and sub-category using keyword matching
7. Suggest account where possible
8. Check duplicates and near duplicates
9. Present all parsed rows in a review screen
10. Allow user edits before final save
11. Save approved rows only

### 6. Categorization Strategy

V1 categorization should be local and rule-based.

Approach:

- Maintain a keyword-to-category mapping
- Match on merchant names, payment references, and normalized descriptions
- Suggest category and sub-category
- Keep all suggestions editable

Examples:

- `swiggy`, `zomato` -> Food
- `uber`, `ola` -> Transport
- `salary`, `payroll` -> Income
- `netflix`, `spotify` -> Entertainment

This avoids cloud dependence while leaving room for future local-model or AI-assisted improvements.

### 7. Deduplication and Near-Duplicate Flags

The system should avoid inserting the same transaction twice.

#### Hard Duplicate

A row should be treated as a duplicate if these fields match an existing transaction:

- Date
- Amount
- Type
- Account
- Normalized description

Hard duplicates should be excluded from final import by default.

#### Near Duplicate

A row should be flagged for review if:

- Date matches
- Category matches
- Amount differs only slightly

Default tolerance:

- Rs. 10

Near duplicates should not be auto-rejected. They should be shown with a warning and allow the user to resolve them as:

- Duplicate
- Different transaction
- Resolved and de-flagged

## User Experience Blueprint

### Screen List

1. Login screen
2. Dashboard screen
3. Add transaction modal or page
4. Edit transaction modal or page
5. Categories management screen
6. Accounts management screen
7. Import upload screen
8. Import review screen
9. Export/report dialog
10. Settings screen

### Dashboard UX

The dashboard should prioritize readability and low friction.

Key principles:

- Clean table layout
- Strong spacing and typographic hierarchy
- Clear distinction between debits, credits, and transfers
- Filters visible without clutter
- Fast inline access to edit actions

Suggested columns:

- Date
- Type
- Amount
- Category
- Sub-category
- Account
- Description
- Note
- Flags
- Actions

### Add/Edit Transaction UX

The entry form should be short and efficient.

Suggested field order:

1. Type
2. Date
3. Amount
4. Account
5. Category
6. Sub-category
7. Note

Behavior:

- Show sub-category only after category is chosen and if sub-categories exist
- Validate note length live
- Preserve form state until submission or cancel

### Import Review UX

Each imported row should show:

- Parsed date
- Parsed amount
- Inferred type
- Suggested category
- Suggested sub-category
- Suggested account
- Parsed description
- Duplicate or near-duplicate status
- Include/exclude toggle

The user should be able to:

- Edit any field
- Mark a duplicate warning as resolved
- Exclude a row from import
- Confirm only selected rows

## Data Model Blueprint

### Main Entities

#### users

- id
- username
- password_hash
- created_at
- updated_at

#### accounts

- id
- name
- last4 nullable
- created_at
- updated_at

#### categories

- id
- name
- icon_type
- icon_value
- created_at
- updated_at

Notes:

- `icon_type` can be `builtin` or `upload`
- `icon_value` can be an icon key or local file reference

#### subcategories

- id
- category_id
- name
- created_at
- updated_at

#### transactions

- id
- type
- date
- posted_date nullable
- amount
- currency
- category_id
- subcategory_id nullable
- account_id nullable
- description
- note nullable
- source
- import_batch_id nullable
- flag_status
- created_at
- updated_at

Suggested enums:

- `type`: `debit`, `credit`, `transfer`
- `source`: `manual`, `import`
- `flag_status`: `none`, `near_duplicate`, `resolved`

#### import_batches

- id
- source_name
- file_name
- file_type
- imported_at
- status

#### import_rows

- id
- import_batch_id
- raw_date
- raw_amount
- raw_description
- parsed_type
- parsed_date
- parsed_posted_date nullable
- parsed_amount
- suggested_category_id nullable
- suggested_subcategory_id nullable
- suggested_account_id nullable
- duplicate_status
- resolution_status
- include_in_import
- created_transaction_id nullable

Suggested enums:

- `duplicate_status`: `none`, `hard_duplicate`, `near_duplicate`
- `resolution_status`: `pending`, `approved`, `excluded`, `resolved_duplicate`, `resolved_distinct`

#### keyword_rules

- id
- keyword
- category_id
- subcategory_id nullable
- priority
- created_at
- updated_at

## Validation Rules

- Username required
- Password required
- Category names required
- Top-level categories capped at 50
- Sub-categories one level only
- Note max length 70
- Uploaded category image max 300 KB
- Amount must be greater than 0
- Date required
- Category required for debit and credit
- Duplicate detection runs before insert on imported rows

## Import Architecture

### Parsing Stages

1. File intake
2. Source detection
3. Raw row extraction
4. Field normalization
5. Type inference
6. Description cleanup
7. Account matching
8. Category suggestion
9. Duplicate analysis
10. Review payload creation

### Source Adapters

To keep imports maintainable, each statement type should follow an adapter-style structure.

Examples:

- `bank-csv-adapter`
- `bank-pdf-adapter`
- `gpay-csv-adapter`
- `gpay-pdf-adapter`

Each adapter should return normalized rows in the same internal format so the downstream review process is shared.

### Description Normalization

Normalized descriptions should:

- Lowercase text
- Remove excess whitespace
- Remove noisy transaction reference fragments where possible
- Preserve merchant-identifying words
- Prefer short keyword-oriented descriptions rather than full raw statements

## Export Architecture

### CSV Export

CSV export should reflect the current dashboard filters and column set.

### PDF Export

The PDF report should include:

- Report title
- Date range
- Applied filters
- Generated timestamp
- Tabular transaction list
- Summary totals for debit and credit

Optional later enhancement:

- Category totals summary block

## Security Model

This app is local-only, but basic protection is still required.

V1 expectations:

- Single local username/password
- Password stored as secure hash
- No plain-text password storage
- No cloud sync
- No external transmission of transaction data

This is organizer-level security, not banking-grade security, but it should still follow basic good practice.

## Folder Structure Proposal

```text
FinanceTracker/
  README.md
  client/
    src/
      app/
      components/
      features/
        auth/
        dashboard/
        transactions/
        categories/
        accounts/
        imports/
        reports/
      styles/
  server/
    src/
      api/
      auth/
      db/
      imports/
        adapters/
        parsers/
        classifiers/
      reports/
      services/
      utils/
  shared/
    src/
      types/
      constants/
      validators/
  data/
    app.db
    uploads/
    exports/
```

Notes:

- `data/` holds all local runtime data
- uploaded files can be stored temporarily or archived based on product decision
- exports should be written locally for user download

## Implementation Plan

### Phase 1: Foundation

- Initialize client and server projects
- Set up SQLite and migrations
- Create local auth flow
- Build shared type definitions
- Add basic app shell and navigation

### Phase 2: Core Data Entry

- Build accounts management
- Build category and sub-category management
- Build manual transaction entry
- Build transactions table
- Add edit and delete flows

### Phase 3: Filtering and Reporting

- Add dashboard filters
- Add sorting and search
- Add CSV export
- Add formatted PDF export

### Phase 4: Imports

- Build import upload flow
- Implement CSV adapters
- Implement PDF text extraction pipeline
- Build keyword-based categorization
- Add duplicate and near-duplicate detection
- Build import review screen
- Save approved rows

### Phase 5: Hardening

- Improve validation and error handling
- Add audit-friendly status markers on imported rows
- Add seed data for starter categories and icons
- Add tests for parsing and deduplication

## Testing Strategy

### Unit Tests

- Validators
- Keyword classification
- Duplicate detection
- Amount/date normalization
- Statement adapter parsing

### Integration Tests

- Transaction creation and editing
- Category/sub-category flows
- Import review and save flow
- Dashboard filters
- CSV and PDF export

### Manual Test Scenarios

- Add a debit manually
- Add a credit manually
- Add a transfer
- Create and edit categories
- Create sub-categories
- Import bank CSV with duplicates
- Import PDF with near-duplicates
- Resolve flagged rows
- Export filtered dashboard to CSV and PDF

## Open Decisions for Build Start

These are not blockers, but should be finalized when implementation begins:

- Which React framework to use, if any
- Which icon set to adopt for default category logos
- Whether uploaded category images are stored in the database or local filesystem
- Whether transactions support soft delete or hard delete
- Whether imported source files are retained after processing

## Recommended Build Principles

- Keep the UI highly readable rather than dense
- Treat imports as editable suggestions, not truth
- Prefer simple deterministic rules over hidden automation
- Keep all data portable and local
- Build browser-first, but avoid choices that block desktop packaging later

## Definition of Done for V1

V1 is complete when the user can:

- Log in locally
- Create and manage accounts, categories, and sub-categories
- Add and edit debit, credit, and transfer transactions
- View transactions in a filterable dashboard
- Import CSV and text-based PDF statements
- Review parsed rows before saving
- Detect duplicates and near duplicates
- Resolve flags manually
- Export filtered data as CSV and formatted PDF

## Next Step

The next implementation step should be to scaffold the project and lock in the concrete stack choices for:

- frontend framework
- backend framework
- SQLite library or ORM
- PDF parsing library
- PDF generation library

Once those are chosen, the repository can be initialized directly against this blueprint.
# personal-finance-tracker
