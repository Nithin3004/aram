# ARAM — Shop Network Stock & Sales (preview)

Monorepo (pnpm): `packages/shared` (types, zod schemas, domain rules, tokens, EN/TA translations),
`apps/api` (NestJS + Prisma + Postgres), `apps/web` (Next.js HO dashboard), `apps/mobile` (Expo shop app).

## Run the preview

Needs Node 20+, pnpm 9, Docker Desktop running.

```bash
pnpm install
docker compose up -d
pnpm --filter @aram/shared build
cd apps/api && cp .env.example .env && npx prisma migrate deploy && pnpm seed && pnpm build && pnpm start
```

Then in two more terminals:

```bash
pnpm dev:web      # http://localhost:3000  (Head Office)
pnpm dev:mobile   # http://localhost:8081  (shop app in the browser)
```

`apps/web/.env.local` and `apps/mobile/.env` point at `http://localhost:4000/api` (copy from `.env.example`).
For a real phone with Expo Go, set `EXPO_PUBLIC_API_URL` to your PC's LAN IP.

### Logins (preview data)
| Who | Username | Password |
|---|---|---|
| Super Admin | `karthik` | `Admin@123` |
| Admins (different permissions) | `anitha`, `vignesh`, `nandhini`, `viewer` (view-only) | `Admin@123` |
| Small shop (Chennai) | `s001` … `s369` | `Shop@123` |
| Supervisor shop | `sup01` … `sup10` (try `sup07` Salem) | `Shop@123` |

OTP: SMS is not sent in preview (`SMS_PROVIDER=console`); the code is shown on the screen and in the API log.
Admins always need OTP; shops only on a new device.

### Things to try
- **Receive**: HO → Dispatches → DSP to S-001 "Dispatched" → note the code → shop app `s001` → Deliveries → enter code → weights → photo → confirm. Change a weight to see a DISCREPANCY + auto issue.
- **Transfer**: `sup07` sees an HO order to send rice to Kumarapalayam → "I sent it".
- **Closing**: shop app → Daily closing → count → cash/UPI → review shows the money gap; submit locks the day.
- **Offline**: shop app → tap the Synced pill → "Simulate offline" → raise a request / closing → it queues → turn off → it syncs once.
- **Language**: English/தமிழ் switch in both headers and on login; saved per user and per device.

### Reset preview data
`pnpm --filter @aram/api db:reset` (drops the preview schema and reseeds — local dev DB only).

## Tests
```bash
pnpm --filter @aram/shared test   # match check, sold qty, variance, low stock, units, translations
pnpm --filter @aram/api test      # e2e: permissions, dispatch lifecycle, approvals, closing, offline de-dup, lockout, append-only
```
