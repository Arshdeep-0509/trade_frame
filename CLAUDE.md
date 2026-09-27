# RSI-HA Frontend — Hard Rules

These rules apply to this step and every future step in this project. Do not
relax, reinterpret, or forget them as work continues.

```
HARD RULES (apply to this and every future step):
1. Do NOT change, "fix", optimise, or reinterpret any strategy or indicator
   logic from mastertrust_rsi_ha_screener.py. Port behaviour 1:1, including
   its quirks and its edge cases. If you think something is a bug, leave it
   and add a `// PARITY:` comment — do not change it.
2. Frontend only. No server, no real HTTP calls, no API keys, no .env secrets.
   EXCEPTION (decided by the project owner): /intraday reads REAL Master Trust
   data through the backend repo's mastertrust_intraday_api.py (src/data/http/). The token
   still lives only in that Python service's .env, never in this codebase.
   /rsi-ha stays on the mock — do not switch it without being asked.
3. All mock data must match the REAL response shapes documented in
   STRATEGY-CONTRACT.md. No hardcoded visible values (no fake "RELIANCE +2.3%"
   strings baked into JSX). Every number on screen must come out of the
   strategy engine running on generated candles.
4. TypeScript strict. No `any`. No `@ts-ignore`.
5. Show me the file tree you changed and run `npm run build` + `npm test`
   before you tell me you're done.
```

## Where things live

- The reference strategy implementation is `mastertrust_rsi_ha_screener.py` in
  the separate backend repo (usually cloned next to this one as `../backend/`).
- [`docs/STRATEGY-CONTRACT.md`](./docs/STRATEGY-CONTRACT.md) documents the
  config constants, the known docstring/code discrepancy, the real upstream
  response shapes, and the behavioural quirks that must survive porting.
  Read it before touching `src/strategy/` or `src/data/`.
- Raw upstream API shapes: `src/types/api.ts`. Normalised app shapes:
  `src/types/domain.ts`.
- The data-source contract (mock and real implementations both satisfy it)
  is `src/data/MarketDataSource.ts`. The real one is
  `src/data/http/HttpMarketDataSource.ts`, used only by /intraday
  (`src/app/intradayDataSource.ts`). Run it with
  `uvicorn mastertrust_intraday_api:app --port 8000` from the backend repo;
  `npm run dev` proxies `/api` to it.
- Strategy/indicator ports belong in `src/strategy/`.
- Mock API and mock WebSocket implementations belong in `src/data/`.
