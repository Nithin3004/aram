# Free trial deployment

| Part | Service | URL you'll get |
|---|---|---|
| Database + delivery photos | Supabase (free) | — |
| Backend API | Render (free) | `https://aram-api-xxxx.onrender.com` |
| HO web dashboard | Vercel (free) | `https://aram-ho-xxxx.vercel.app` |
| Shop app (browser version) | Vercel (free) | `https://aram-shop-xxxx.vercel.app` |

Free-tier limits: the API sleeps after 15 min idle (first request then takes ~1 min); Supabase pauses after
7 days with no use. OTP is shown on screen (no SMS) — fine for a trial with preview data, not for real shops.

Never paste passwords or keys into chat. Enter them only in the Supabase / Render / Vercel dashboards.

## 1. GitHub (code)
1. Create a **private** repository named `aram` on github.com (no README, no .gitignore).
2. Tell Claude the repo URL — Claude pushes the code (Windows may open a browser window asking you to sign in to GitHub).

## 2. Supabase (database + photos)
1. supabase.com → New project. Name `aram`, region **South Asia (Mumbai)**, set a strong database password and keep it.
2. **Database URL:** Project → Connect → **Session pooler** → copy the URI and put your DB password in it.
   (Use the session pooler, not "Direct connection" — Render needs it.)
3. **Photos bucket:** Storage → New bucket → name `aram-photos`, **Private**.
4. **Photo keys:** Project Settings → Storage → S3 Connection → copy the *Endpoint* and *Region*, then
   "New access key" → copy the *Access key ID* and *Secret access key*.

## 3. Render (API)
1. render.com → sign in with GitHub → New → **Blueprint** → pick the `aram` repo (it reads `render.yaml`).
2. When asked for values, paste:
   - `DATABASE_URL` = Supabase session pooler URI (step 2.2)
   - `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` = step 2.4
   - `CORS_ORIGINS` = leave `https://example.com` for now; fixed in step 5.
3. Deploy. The first build also creates the tables and loads the preview data (~5–10 min).
4. Open `https://<your-api>.onrender.com/api/health` → should show `{"ok":true}`. Copy the API address.

## 4. Vercel (dashboard + shop app) — two projects from the same repo
1. vercel.com → sign in with GitHub → Add New → Project → import `aram`.
   - **Root Directory:** `apps/web` · Project name `aram-ho`
   - Environment variable `NEXT_PUBLIC_API_URL` = `https://<your-api>.onrender.com/api`
   - Deploy.
2. Add New → Project → import `aram` again.
   - **Root Directory:** `apps/mobile` · Project name `aram-shop`
   - Environment variable `EXPO_PUBLIC_API_URL` = `https://<your-api>.onrender.com/api`
   - Deploy.

## 5. Connect them
Render → aram-api → Environment → set `CORS_ORIGINS` to both Vercel addresses, comma-separated, e.g.
`https://aram-ho.vercel.app,https://aram-shop.vercel.app` → Save (it redeploys).

## 6. Optional: keep the API awake
uptimerobot.com (free) → New monitor → HTTP(s) → `https://<your-api>.onrender.com/api/health` every 5 min.
One always-on free service fits in Render's 750 free hours a month.

## Logins (preview data)
HO: `karthik` / `Admin@123` · Shops: `s001`, `sup07` … / `Shop@123` (OTP shown on screen).
These demo passwords are public in this repo — use the trial only with preview data.
