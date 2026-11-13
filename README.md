# FINN

Mobile-first AI investment copilot (ENAM build challenge) — **installable Progressive Web App**.

## Run locally (one command)

```bash
npm install   # first time only
npm run finn  # starts API :8000 + Next :3000
```

Then open:

- Demo path: http://127.0.0.1:3000/demo  
- App: http://127.0.0.1:3000/home  
- Research: http://127.0.0.1:3000/research/INFY  
- Markets (all NSE): http://127.0.0.1:3000/search  
- API docs: http://127.0.0.1:8000/docs  

Core routes work without signup. Live quotes go through the same-origin `/finn-api` proxy.  
CSV upload on Portfolio becomes the active book for Home / Protect / Ask.

Optional separate terminals: `npm run api` and `npm run dev`.

Refresh the full NSE equity list:

```bash
npm run universe:nse
```

## PWA (installable app)

FINN ships as a Progressive Web App:

- Web app manifest (`/manifest.webmanifest`) — name **FINN**, standalone display  
- Icons 192×192 / 512×512 (+ Apple touch icon)  
- Service worker (`/sw.js`) — caches app shell only; **never** caches `/finn-api` or market data  
- Offline page at `/offline`  
- iOS home-screen metadata + Android install prompt  

See **[DEPLOY.md](./DEPLOY.md)** for GitHub → Vercel → phone install steps.

## Production env

Copy `.env.example` → `.env.local` (local) or set in Vercel:

| Variable | Purpose |
|----------|---------|
| `FINN_API_ORIGIN` | Optional HTTPS URL of FastAPI. Without it, Vercel still serves live quotes + NSE search. |

Never put API keys, passwords, or tokens in frontend code.

## What’s included

- Onboarding financial profile  
- Push digest + Ask FINN pull  
- Research + decision cards + idea logging  
- Protect (Guardian) + Risk desk with live quotes  
- Full NSE equity search (EQUITY_L)  
- FastAPI holdings snapshot + live quotes  
- CSV portfolio upload  
- Recommendation track record  
- Installable PWA shell  

## Trust

Primary numbers and filings are grounded in company / exchange sources when the API is connected. Live marks come from market data feeds. FINN does not place trades.
