# Deploy FINN (free HTTPS + installable PWA)

FINN is a **Next.js 15** frontend with an optional **FastAPI** backend.  
Quotes + NSE search already work from the Next server alone. Full research / filings / grounded Ask need the Python API.

---

## 1. Push to GitHub

```bash
cd /path/to/ENAM
git status
git add .
git commit -m "Add PWA and production deploy config"
# first time:
# git remote add origin https://github.com/<you>/ENAM-FINN.git
git push -u origin main
```

Do **not** commit `.env.local`, `.venv`, or database files.

---

## 2. Deploy frontend on Vercel (free)

1. Go to [https://vercel.com](https://vercel.com) → **Add New Project**.
2. Import your GitHub repo (`ENAM-FINN` or whatever you named it).
3. Framework: **Next.js** (auto-detected).
4. Root directory: project root (where `package.json` lives).
5. Build command: `npm run build` · Output: Next default.
6. Environment variables (optional for v1):
   - `FINN_API_ORIGIN` = `https://your-api.onrender.com` (only after backend is live)
7. Click **Deploy**.

Your public URL will look like:

`https://<project>.vercel.app`

HTTPS is automatic. Open `/demo` or `/home` to verify.

### Without a separate backend

Leave `FINN_API_ORIGIN` unset. You still get:

- Live quotes  
- Full NSE search (2,635+)  
- Portfolio / Protect UI  
- Embedded Ask / digest placeholders  

Primary research + real NSE filings need the Python API.

---

## 3. Optional: free FastAPI backend

Pick one free tier:

| Host | Notes |
|------|--------|
| [Render](https://render.com) | Web Service, free sleep after idle |
| [Railway](https://railway.app) | Free trial credits |
| [Fly.io](https://fly.io) | Free allowance |

Example **Render**:

1. New **Web Service** → connect the same repo.
2. Root directory: `backend`
3. Build: `pip install -r requirements.txt`
4. Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Copy the HTTPS URL → set as `FINN_API_ORIGIN` on Vercel → Redeploy.

Enable CORS on the API if you call it cross-origin (FINN normally proxies same-origin via `/finn-api`, so CORS is usually not needed).

---

## 4. Install on Android (Chrome)

1. Open `https://<your-app>.vercel.app/home` in **Chrome**.
2. Menu **⋮** → **Install app** / **Add to Home screen**,  
   or tap the in-app **Install FINN** banner.
3. Launch from the home screen — opens **standalone** (no browser chrome).

---

## 5. Install on iPhone (Safari)

1. Open the HTTPS URL in **Safari** (not Chrome).
2. Tap **Share** → **Add to Home Screen**.
3. Name: **FINN** → Add.
4. Open the icon — full-screen app with FINN branding.

---

## 6. Verify PWA

On desktop Chrome DevTools → **Application**:

- Manifest: name FINN, standalone, icons 192/512  
- Service worker: `/sw.js` active  
- Offline: `/offline` fallback (API routes are **not** cached)

---

## Limitations (honest)

| Item | Status |
|------|--------|
| Vercel Hobby | Free HTTPS + custom `*.vercel.app` |
| Custom domain | Optional; DNS may be free, domain name usually paid |
| Render free API | Sleeps when idle (~cold start) |
| Offline markets | Live prices intentionally **not** cached |
| App Store / Play Store | Not required for PWA; native store listing is paid/separate |

No paid service is required for a public installable FINN app on Vercel.
