# CLAUDE.md — Shop Network Stock & Sales System

## What this is
A stock, purchase, sales and profit system for a grocery chain, replacing the HO workbook
`Grocery_Chain_Sales_Stock_Profit new.xlsx` (the workbook's rules are the source of truth):
- **1 Head Office (HO)** — full control, sees everything; can also hold warehouse stock and dispatch it
- **10 Supervisors** (`SUP01`–`SUP10`) — each oversees **40 shops**; modelled as supervisor accounts that see their shops' stock
- **400 Shops** (`S001`–`S400`) — buy, sell, and record their day

Master data comes from the workbook (Shops, Supervisors, Products sheets): shop IDs, names and supervisor codes.
Products today: Chana Dal, Toor Dal, Moong Dal, Urad Dal, Sugar (**kg**) and Oil (**litres**), up to 15.

Two surfaces:
- **Android app** — used by supervisor shops and small shops (one login per shop)
- **Web dashboard** — used by Head Office admins

Bilingual: **English + Tamil** everywhere (UI, reports, notifications).
- A **language switcher** is available on both the web dashboard and the Android app, including on the login screen.
- Switching takes effect instantly, without reload or re-login.
- The choice is saved per user (server-side) and per device (so it persists offline and before login).
- Data entered by users (item names, notes) is stored once. Shops, supervisors and products all have an English **and a Tamil** name, editable by HO. Where the workbook has no Tamil name, a Tamil one is filled in (e.g. "Shop 001" → "கடை 001", "Supervisor 1" → "மேற்பார்வையாளர் 1") and HO can change it.

---

## Roles & visibility

| Role | Sees | Can do |
|---|---|---|
| Super Admin (HO) | Everything | Create/disable admins, set each admin's permissions, edit shops (names EN/TA, phone, supervisor), reset passwords, everything below |
| Admin (HO) | Everything | Only what Super Admin granted: approve requests, change prices, manage items, manage vendors/purchases, create dispatches/transfers (and enter opening stock), resolve issues, view-only |
| Supervisor | Own stock + own entries; **stock only** (no sales) of its 40 shops | Receive stock, dispatch when HO orders, raise requests, raise issues, submit daily entry |
| Shop | Own stock + own sales | Enter opening stock (once), submit daily entry (purchases + sales), receive stock, raise requests, raise issues |

Permissions are checked on the **server** for every action. Never trust the client.

---

## Core flows

### 1. Allocation (HO → shops)
- HO decides quantities (no fixed schedule; driven by daily reports + low-stock flags).
- HO creates a **Dispatch** to a supervisor shop or small shop, item by item (kg).
- Source is HO warehouse by default.

### 2. Transfers ordered by HO
- HO can create a Dispatch where the **source is a supervisor shop**:
  - supervisor → another supervisor
  - supervisor → small shop (when HO can't send directly)
- Sender **cannot refuse** in the app. If there's a problem, sender raises an Issue to HO and follows HO's decision.

### 3. Dispatch lifecycle + matching (security core)
Statuses: `CREATED → DISPATCHED → RECEIVED → MATCHED` or `DISCREPANCY → RESOLVED`

- **CREATED** — HO creates it. A unique one-time **delivery code + QR** is generated and printed on the delivery slip that travels with the goods.
- **DISPATCHED** — sender confirms actual quantity sent per item.
- **RECEIVED** — receiver must: scan QR or enter code, enter actual received quantity per item, take a **photo** of the goods. Requires internet.
- **Match check** — per item, compare: HO ordered qty vs sender dispatched qty vs receiver received qty.
  - All equal → `MATCHED`, stock ledgers update.
  - Any mismatch → `DISCREPANCY`, an **Issue is auto-raised** to HO immediately. Only HO can resolve.
- No one can mark a dispatch received without the valid code.

### 4. Stock requests (shop → HO)
- Supervisor or small shop raises a **Request** when stock isn't enough (items + qty + reason).
- Statuses: `PENDING → APPROVED (full or partial) | REJECTED (reason required)`
- Only admins with approve permission can act. Approval auto-creates a Dispatch.
- Requests cannot be edited or deleted after submit. Flag shops with unusually frequent requests on the HO dashboard.

### 5. Daily entry (every shop) — the workbook's Daily_Entry
Sales are NOT billed per customer (yet). Each day each shop records, **per product**:
- **Purchases**: loose quantity (kg/L) and/or the number of **½ kg/L and 1 kg/L packs**, with the **rate (₹ per kg/L)**. Optional price per pack if packs cost differently.
- **Sales**: the same — loose and/or packs, with the **selling rate** the shop charged that day (optional pack prices). HO's product price is only the **suggested** rate, pre-filled; the shop may change it.
- Cash collected and UPI collected.

System computes:
- Packs → quantity: loose + ½ × packs + 1 × packs; amount = loose × rate + packs × (pack price, or size × rate).
- **Closing qty** = opening + purchases − sales (+ received from HO − sent on transfers ± HO adjustments) per product. Shops do **not** count closing stock.
- **Sales amount** = Σ sales qty × rate typed (or pack prices).
- **Variance** = (cash + UPI) − sales amount → flagged beyond a tolerance set by HO (auto issue).
- Closing qty below zero (sold more than held) → flagged (auto issue).

Entry is **locked after submit**. Corrections only via HO-approved adjustment (logged). Next day's opening = previous closing. Can be entered offline and synced.

### 5a. Opening stock (once per shop)
- The workbook's Opening_Stock: quantity **and cost rate** per shop and product as on the start date.
- Not imported: each shop enters it **once** on first use of the app (or HO enters it for any shop). After any daily entry it can only change via HO adjustment.
- Phone numbers, opening stock and cost rates are filled in as people start using the system — never required at import.

### 5b. Profit & registers (HO) — the workbook's reports
- **Cost rate** per product per month = that month's average purchase rate (HO purchases and the shops' own purchases, all shops); months with no purchases carry the previous month forward; before any purchase, HO's opening cost rate or the average opening-stock rate (workbook Rate_Card).
- **Cost of goods sold** = sales qty × cost rate. **Gross profit** = sales − COGS (rent, salaries, wastage excluded). GP %.
- Daily / Monthly / Yearly registers (financial year 1-Apr to 31-Mar): opening stock ₹, purchases (+ received) ₹, sales ₹, COGS ₹, gross profit, GP %, closing stock ₹; quantities when one product is chosen. Filter by supervisor, shop, product. CSV export.
- kg and litres are never added together as quantities.

### 6. Issues
- Raised automatically (discrepancies, variances) or manually by any shop (damaged goods, transfer problems, etc.).
- Statuses: `OPEN → RESOLVED` (resolution note required, HO only).

### 7. Vendors & purchases
- HO: add / edit / deactivate vendors; record HO purchases (vendor, item, qty, cost per kg/L, date, invoice) → HO warehouse stock.
- Shops also buy for themselves: recorded in the daily entry (qty + rate), adding to the shop's stock.

### 8. Items & prices (HO)
- Products from the workbook (up to 15); HO can add/edit. Each product has a **unit: kg or L** (oil). Quantities are stored as integer grams / millilitres.
- Items with any history are **deactivated, never deleted** — hidden from shops, history intact.
- HO sets one **suggested selling price** per product (pre-fills the shops' daily entry). Effective-dated: a change applies from the next day; a product's first price applies from today. Old prices kept; every change logged.
- HO may set an **opening cost rate** per product for profit before purchases exist.

### 9. Low-stock flags
- For each shop/item: average daily sold (last 7 days) → days of stock left.
- Flag below a threshold (configurable by HO). App suggests, HO decides.

---

## Non-negotiable rules
- **Audit log is append-only.** Every create/approve/reject/dispatch/receive/resolve/price change/login records who, what, when, before/after. No edit, no delete, not even for Super Admin.
- **Stock is a ledger.** Every movement (opening stock, purchase, dispatch out, receive in, daily sold, adjustment) is a ledger entry. Current stock = sum of entries. Never overwrite a stock number. Corrections are reversing entries.
- **Quantities stored as integer grams (or millilitres), money as integer paise.** No floats. Display in kg / L / ₹.
- Timestamps stored in UTC, displayed in IST.
- Offline allowed for: daily entry, drafting requests, raising issues, viewing last-synced data. **Online required** for: receiving (code check), opening stock, approvals, dispatch creation, price changes.
- Offline submissions carry a client-generated ID so syncing twice never duplicates.

---

## Login
- Username + password for all users.
- OTP to registered phone as a second step for HO admin logins (and on new device for shops).
- Super Admin creates all shop and admin accounts; shops cannot self-register.
- Lock account after repeated failed attempts; log every login.

---

## Tech stack
- **Monorepo** (pnpm workspaces), TypeScript everywhere
- **Backend:** NestJS + PostgreSQL + Prisma
- **Web dashboard (HO):** Next.js
- **Android app:** React Native (Expo) with local SQLite for offline + sync queue
- **Shared package:** types, validation schemas, status enums, translation keys
- **i18n:** i18next, English + Tamil, no hardcoded UI strings
- **Photos:** S3-compatible object storage
- **OTP SMS:** MSG91 (or similar Indian provider), behind an interface so it can be swapped

---

## Design
UI design comes from **Claude Design** and lives in `/design` (exports + screenshots, one subfolder per surface: `/design/web`, `/design/android`).

- Follow `/design` for layout, colours, typography and components. Don't invent a new visual style.
- **The design WILL change later.** So keep look and logic separate:
  - All colours, fonts, spacing and radii live in one **theme/tokens** file per app (shared values in the shared package). No hardcoded styles in screens.
  - Screens are built from a small set of **shared UI components** (button, input, table, status badge, card, etc.). Restyling a component restyles everywhere.
  - Business logic, API calls and state never live inside visual components.
- When `/design` is updated, apply the change by updating tokens and shared components first, then adjusting affected screens. Never change flows or business rules because of a design change. If a design conflicts with a flow in this file, this file wins. Flag the conflict.
- If a screen isn't designed yet, build it plain using the existing tokens and components, then flag it.
- Keep `/design/CHANGELOG.md` noting which design version is implemented.

---

## Future provision (do NOT build now)
**Per-customer billing** with customer cards, item-by-item bills, cash/UPI per bill. Keep the schema ready: sales should be modelled so that a `Sale` with line items can later replace the daily-closing-derived sold qty without breaking reports. Don't build UI or endpoints for it yet.

---

## Build order
1. Monorepo setup, backend, DB, auth (password + OTP), roles/permissions, audit log
2. Master data: shop hierarchy, items, prices, vendors, purchases
3. Stock ledger + dispatch lifecycle + code/QR + photo + match check + auto issues
4. Requests & approvals, HO-ordered transfers
5. Daily entry (purchases + sales, packs) + variance calculation; opening stock; profit registers
6. HO dashboard: stock per shop, sales per shop, variances, pending requests, open issues, low-stock flags, request-frequency flags
7. Android app with offline + sync
8. Tamil translations complete, polish, reports export

Finish and test each step before moving on. Write tests for: match check, pack conversion and closing-qty calculation, variance, cost of goods / gross profit, permissions, offline sync de-duplication.

---

## Working conventions
- Ask before adding new dependencies or changing the stack.
- Ask when a business rule here is unclear. Don't guess.
- Keep it simple. No features beyond this file without asking.
