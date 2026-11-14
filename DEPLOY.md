# Deployment

Never paste passwords or keys into chat or into a file in this repo (the GitHub repo is **public**).
Enter them only in the Render / Vercel / Supabase / Expo dashboards.

## What runs where today (free trial)

| Part | Service | Address |
|---|---|---|
| Code | GitHub `Nithin3004/aram` (public) | pushes to `main` redeploy everything below |
| Database + delivery photos | Supabase (free) | — |
| Backend API | Render (free) | https://aram-api-0q5n.onrender.com/api/health |
| HO web dashboard | Vercel (free) | https://aram-drab.vercel.app |
| Shop app in a browser | Vercel (free) | https://aram-mobile.vercel.app |
| Android app (APK) | Expo EAS, project `aram-shop` | expo.dev → nithin3004 → aram-shop → Builds |

The API build (`render.yaml`) migrates the database, loads the real workbook data from `data-import/live`
into the `live` schema **only if it is empty** (later deploys never overwrite data), and fills missing Tamil names.
`/api/health` shows `"dataset":"live"` when the real data is in use.

**Server logins:** `admin` (Super Admin) with your `SEED_ADMIN_PASSWORD`; `sup01`…`sup10` and `s001`…`s400`
with your `SEED_SHOP_PASSWORD` (both set by you in Render → aram-api → Environment).

Free-tier limits: the API sleeps after 15 min idle (first request then takes ~1 min); Supabase pauses after
7 days unused and has no automatic backups; OTP is shown on screen, not sent by SMS.

## Android app

```bash
cd apps/mobile && npx eas-cli@latest build --platform android --profile preview
```

Gives an installable APK link (internal testing). The API address is built into the app (`eas.json` →
`EXPO_PUBLIC_API_URL`), so **every time the API address changes, build a new APK** and reinstall.
For Play Store: `--profile production` (an `.aab`), then upload in Google Play Console.

---

## Go-live checklist (moving to a real server)

### Pick the hosting
- **Option A — same services, paid plans (simplest, nothing to rebuild):** Render *Starter* (no sleeping),
  Supabase *Pro* (daily backups, no pausing), Vercel *Hobby/Pro*. Only the plan changes in each dashboard.
- **Option B — your own server (VPS):** one Linux machine running PostgreSQL, the API (`node dist/main.js`
  behind nginx + HTTPS), the web dashboard (`next start`) and S3-compatible storage (or keep Supabase storage).
  Needs setting up; ask Claude to prepare it once the server details are known.

### Must do before real shops use it
1. **Your own domain** (e.g. `api.yourshop.in`, `ho.yourshop.in`) pointing at the API and dashboard, so the
   address in the Android app never has to change again. Then set `CORS_ORIGINS` to the dashboard / shop-app
   addresses, and `EXPO_PUBLIC_API_URL` (Vercel shop app + `eas.json`) to `https://api.yourshop.in/api`.
2. **Real OTP by SMS.** Register with MSG91 (Indian SMS needs **DLT registration** of the sender and template —
   it can take several days, start now). Then set `SMS_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_TEMPLATE_ID`.
   ⚠ Once SMS is on, a person can log in only if their **phone number is filled in**: admins always need OTP, and
   every shop needs it on its first login from a phone. Enter phones first (Super Admin → Shops → Edit shop;
   Admins → phone), or keep `SMS_PROVIDER=console` until they are in.
3. **Passwords.** Starting passwords are shared by all shops — ask everyone to change theirs on first login
   (Settings → Change password). Create separate accounts for each HO person (Admins & permissions) rather than
   sharing `admin`.
4. **Secrets.** `JWT_SECRET` long and random (Render generates one); database password strong; S3 keys private.
5. **Backups.** Daily database backups switched on (Supabase Pro, or `pg_dump` from cron on a VPS) — and try a
   restore once.
6. **Fresh APK** built against the final API address; install it on every shop phone.

### Moving the data
- Moving the database to a new host: `pg_dump` the `live` schema from Supabase and restore it on the new
  PostgreSQL (keeps every entry, ledger line and audit record). Do it while nobody is entering data.
- Starting clean on the new host instead: the first API build loads the workbook data automatically
  (`data-import/live`, only into an empty schema).
- The `preview` schema on Supabase holds only sample data; it can be dropped once you no longer need the demo.

### After switching
- `https://<api>/api/health` shows `"dataset":"live"`.
- Log in as `admin` on the dashboard, as one supervisor and one small shop in the app.
- Optional: uptimerobot.com monitor on `/api/health` every 5 min to be told if the API goes down.
