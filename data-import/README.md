# Loading your real data

Fill the five files in `templates/` (open them in Excel), then **Save As → "CSV UTF-8 (Comma delimited)"**
so the Tamil names are kept. Put your finished files in `data-import/real/` — that folder is never
uploaded to GitHub (shop names and phone numbers stay private).

| File | One row per | Columns |
|---|---|---|
| `admins.csv` | Head Office person | `username`, `name`, `phone` (10 digits), `role` (`SUPER_ADMIN` or `ADMIN`), `permissions` (separate with `;`) |
| `shops.csv` | shop | `code` (e.g. `S-001`, `SUP-01`), `type` (`SUPERVISOR` or `SMALL`), `name_en`, `name_ta`, `supervisor_code` (empty for supervisors), `username`, `phone` |
| `items.csv` | item | `code`, `name_en`, `name_ta`, `unit` (`kg` or `L`), `price_per_kg` (₹ per kg or per litre; may be empty — then set it on Items & prices) |
| `vendors.csv` | vendor | `name_en`, `name_ta`, `phone`, `supplies` |
| `opening_stock.csv` | shop + item with stock today | `shop_code` (`HO` for the warehouse), `item_code`, `kg` (kg or litres), `rate` (₹ cost per unit, optional — used for profit until purchases exist) |

`data-import/live/` holds the live data converted from the HO workbook (shop IDs S001–S400, supervisors
SUP01–SUP10, 6 products). Tamil names and phone numbers may be left empty there and added later.

Permissions: `APPROVE_REQUESTS`, `CHANGE_PRICES`, `MANAGE_ITEMS`, `MANAGE_VENDORS`, `CREATE_DISPATCH`,
`RESOLVE_ISSUES`. An admin with none is view-only. Super Admin always has everything.

Rules the importer checks (it lists every problem with file and line, and imports nothing until all are fixed):
- usernames: lowercase letters, numbers, `.` `_` `-`, at least 3, all different across admins and shops
- every SMALL shop names an existing SUPERVISOR in `supervisor_code`
- every shop and item has both an English and a Tamil name
- prices and kg are numbers above 0; each shop/item appears once in `opening_stock.csv`
- at least one `SUPER_ADMIN`

Everyone starts with one shared starting password (one for admins, one for shops) that you choose at
import time; each person changes theirs after first login (Settings → Change password). A forgotten
password is reset by the Super Admin (Shops → shop → Reset password, or Admins → Reset password).
