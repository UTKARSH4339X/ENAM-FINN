# FINN

Mobile-first AI investment copilot (ENAM build challenge).

## Run (one command)

```bash
npm install   # first time only
npm run finn  # starts API :8000 + Next :3000
```

Then open:
- Demo path: http://127.0.0.1:3000/demo  
- App: http://127.0.0.1:3000/home  
- Research: http://127.0.0.1:3000/research/INFY  
- API docs: http://127.0.0.1:8000/docs  

Core routes work without signup. Live quotes go through the same-origin `/finn-api` proxy.
CSV upload on Portfolio becomes the active book for Home / Protect / Ask.

Optional separate terminals: `npm run api` and `npm run dev`.

Refresh the full NSE equity list:

```bash
npm run universe:nse
```

## What’s included

- Onboarding financial profile
- Push digest + Ask FINN pull
- Research + decision cards + idea logging
- Protect (Guardian) + Risk desk with live quotes
- Full NSE equity search (EQUITY_L)
- FastAPI holdings snapshot + live quotes
- CSV portfolio upload
- Recommendation track record

## Trust

No broker passwords. Read-only analysis. Live NSE quotes via Moneycontrol / NSE feeds.
