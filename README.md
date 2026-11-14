# ARAM — Shop Network Stock & Sales

Stock, purchase, sales and profit system for the grocery chain, replacing the HO workbook
`Grocery_Chain_Sales_Stock_Profit new.xlsx`. Rules: see [CLAUDE.md](CLAUDE.md). Deploying: see [DEPLOY.md](DEPLOY.md).

| Part | Folder | Who uses it |
|---|---|---|
| Shared rules, translations (EN/TA), design tokens | `packages/shared` | all |
| Backend API (NestJS + Prisma + PostgreSQL) | `apps/api` | — |
| Head Office web dashboard (Next.js) | `apps/web` | HO admins |
| Shop app (Expo — Android, also runs in a browser) | `apps/mobile` | supervisors and small shops |

## Data

| Data set | Where | What's in it |
|---|---|---|
| **Real (workbook)** | `data-import/live/*.csv` → schema `live` on the server, `live_local` on your PC | 1 HO, 10 supervisors (SUP01–SUP10), 400 shops (S001–S400, 40 per supervisor), 6 products (5 in kg, Oil in litres), Tamil names for all |
| Sample (demo only) | `apps/api/prisma/seed.ts` → schema `preview` | made-up shops with history, for trying features |

Not in the workbook, so entered by people once they start: selling prices (HO → Items & prices),
opening stock + cost rate (each shop once, or HO for them), phone numbers (Super Admin → Shops → Edit),
vendors and purchases (HO), real shop/supervisor names (Super Admin → Shops → Edit).

## Run it on your PC

Needs: Node 20+, pnpm 9, Docker Desktop (running).

**First time only**

```bash
pnpm install
```

```bash
docker compose up -d
```

```bash
pnpm --filter @aram/shared build
```

Then copy `apps/api/.env.example` to `apps/api/.env`, `apps/web/.env.example` to `apps/web/.env.local`,
`apps/mobile/.env.example` to `apps/mobile/.env`, add `DB_SCHEMA=live_local` to `apps/api/.env`, and load the
real data (pick your own local passwords; at least 8 characters):

```bash
cd apps/api && node scripts/db-env.cjs npx prisma migrate deploy
```

```bash
cd apps/api && $env:IMPORT_ADMIN_PASSWORD='Admin@2026'; $env:IMPORT_SHOP_PASSWORD='Shop@2026'; node scripts/db-env.cjs npx ts-node --transpile-only prisma/import.ts ../../data-import/live --if-empty
```

**Every time** — three terminals:

```bash
cd apps/api && pnpm build && pnpm start
```

```bash
pnpm dev:web
```

```bash
pnpm dev:mobile
```

| Open | What |
|---|---|
| http://localhost:3000 | HO web dashboard |
| http://localhost:8081 | Shop app in the browser (use the phone-size view) |
| http://localhost:4000/api/health | API check — shows which data set is loaded |

### Local logins (real data, your PC only)

| Who | Username | Password |
|---|---|---|
| Head Office (Super Admin) | `admin` | `Admin@2026` |
| Supervisor shops | `sup01` … `sup10` | `Shop@2026` |
| Small shops | `s001` … `s400` | `Shop@2026` |

These are only the passwords used for the copy on your PC. The server has its own (the
`SEED_ADMIN_PASSWORD` / `SEED_SHOP_PASSWORD` you set on Render) — never write those in a file.

OTP: with `SMS_PROVIDER=console` no SMS is sent; the code is shown on the login screen. Admins always need an
OTP; shops only on a new device.

### Sample (demo) data instead

Remove `DB_SCHEMA` from `apps/api/.env`, run `pnpm seed` once, restart the API. Logins: `karthik` (Super Admin),
`anitha`, `vignesh`, `nandhini`, `viewer` — password `Admin@123`; shops `s001`… / `sup01`… — `Shop@123`.

## Day one with the real data

1. **HO** → Items & prices: set a selling price for each of the 6 products (and an opening cost rate if known).
2. **Super Admin** → Shops: fix shop/supervisor names (EN + TA) and phone numbers as you get them.
3. **Each shop** (or HO for it) → enter opening stock once: quantity + cost rate per product.
4. **Each shop, every day** → Daily entry: purchases, sales (loose and/or ½ / 1 kg packs), cash, UPI.
5. **HO** → Dispatches, Requests, Issues, Profit & registers (daily / monthly / yearly, CSV export).

## Tests

```bash
pnpm --filter @aram/shared test
```

```bash
pnpm --filter @aram/api test
```

Shared: pack conversion, closing qty, variance, match check, low stock, units, translation coverage.
API (end to end, in a throw-away database schema): permissions, dispatch lifecycle + match check, approvals,
daily entry, opening stock, profit register, offline de-duplication, lockout, append-only audit/ledger.
