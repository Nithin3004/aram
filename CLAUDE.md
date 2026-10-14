# CLAUDE.md — Shop Network Stock & Sales System

## What this is
A stock, dispatch and daily-sales system for a network of **380 shops**:
- **1 Head Office (HO)** — central warehouse, full control, sees everything
- **~10 Supervisor shops** — each supervises ~40 small shops; they warehouse AND sell
- **~370 Small shops** — sell only, no warehousing

Two surfaces:
- **Android app** — used by supervisor shops and small shops (one login per shop)
- **Web dashboard** — used by Head Office admins

Bilingual: **English + Tamil** everywhere (UI, reports, notifications).
- A **language switcher** is available on both the web dashboard and the Android app, including on the login screen.
- Switching takes effect instantly, without reload or re-login.
- The choice is saved per user (server-side) and per device (so it persists offline and before login).
- Data entered by users (item names, notes) is stored once. Item names have an English and a Tamil field set by HO.

---

## Roles & visibility

| Role | Sees | Can do |
|---|---|---|
| Super Admin (HO) | Everything | Create/disable admins, set each admin's permissions, everything below |
| Admin (HO) | Everything | Only what Super Admin granted: approve requests, change prices, manage items, manage vendors/purchases, create dispatches/transfers, resolve issues, view-only |
| Supervisor shop | Own stock + own sales; **stock only** (no sales) of its child shops | Receive stock, dispatch when HO orders, raise requests, raise issues, submit daily closing |
| Small shop | Own stock + own sales | Receive stock, raise requests, raise issues, submit daily closing |

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

### 5. Daily closing (every shop)
Sales are NOT billed per customer (yet). At end of day each shop submits:
- Closing stock per item (kg)
- Cash collected
- UPI collected

System computes:
- **Sold qty** = opening + received today − closing (per item)
- **Expected revenue** = sold qty × selling price on that date
- **Variance** = (cash + UPI) − expected revenue → flagged if non-zero beyond a tolerance set by HO
- Negative sold qty (closing > opening + received) → flagged

Closing is **locked after submit**. Corrections only via HO-approved adjustment (logged). Next day's opening = previous closing. Can be entered offline and synced.

### 6. Issues
- Raised automatically (discrepancies, variances) or manually by any shop (damaged goods, transfer problems, etc.).
- Statuses: `OPEN → RESOLVED` (resolution note required, HO only).

### 7. Vendors & purchases (HO)
- Add / edit / deactivate vendors.
- Record purchases: vendor, item, qty (kg), cost per kg, date, invoice number → adds to HO warehouse stock.

### 8. Items & prices (HO)
- ~30 items now; HO can add/edit items. All quantities in **kg**.
- Items with any history are **deactivated, never deleted** — hidden from shops, history intact.
- **One selling price per item across all shops.** Prices are effective-dated; old prices kept so past sales compute correctly. Every change logged.

### 9. Low-stock flags
- For each shop/item: average daily sold (last 7 days) → days of stock left.
- Flag below a threshold (configurable by HO). App suggests, HO decides.

---

## Non-negotiable rules
- **Audit log is append-only.** Every create/approve/reject/dispatch/receive/resolve/price change/login records who, what, when, before/after. No edit, no delete, not even for Super Admin.
- **Stock is a ledger.** Every movement (purchase, dispatch out, receive in, daily sold, adjustment) is a ledger entry. Current stock = sum of entries. Never overwrite a stock number. Corrections are reversing entries.
- **Quantities stored as integer grams, money as integer paise.** No floats. Display in kg / ₹.
- Timestamps stored in UTC, displayed in IST.
- Offline allowed for: daily closing, drafting requests, raising issues, viewing last-synced data. **Online required** for: receiving (code check), approvals, dispatch creation, price changes.
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
5. Daily closing + variance calculation
6. HO dashboard: stock per shop, sales per shop, variances, pending requests, open issues, low-stock flags, request-frequency flags
7. Android app with offline + sync
8. Tamil translations complete, polish, reports export

Finish and test each step before moving on. Write tests for: match check, sold-qty calculation, variance, permissions, offline sync de-duplication.

---

## Working conventions
- Ask before adding new dependencies or changing the stack.
- Ask when a business rule here is unclear. Don't guess.
- Keep it simple. No features beyond this file without asking.
