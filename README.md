# RSI-HA Screener (frontend prototype)

Trading screener UI. `/rsi-ha` runs on mock data generated in the browser.
`/intraday` shows real Master Trust data, read from the separate **backend**
repo's API (`mastertrust_intraday_api.py`).

## Stack

- Vite + React 18 + TypeScript (strict)
- Tailwind CSS v3
- Zustand for state
- react-router-dom
- lightweight-charts
- Vitest + @testing-library/react
- lucide-react

## Run instructions

```bash
npm install     # install dependencies
npm run dev     # start the dev server (http://localhost:5173, opens at /rsi-ha)
npm run build   # type-check (tsc -b) and produce a production build in dist/
npm run preview # preview the production build locally
npm test        # run the Vitest test suite once
npm run test:watch  # run Vitest in watch mode
npm run lint    # run oxlint
```

### Real data for `/intraday`

Start the backend first (see the backend repo's README):

```bash
uvicorn mastertrust_intraday_api:app --host 127.0.0.1 --port 8000
```

`npm run dev` / `npm run preview` forward every `/api/*` request to
`http://127.0.0.1:8000`. To point somewhere else, set `INTRADAY_API_TARGET`
(e.g. `INTRADAY_API_TARGET=http://127.0.0.1:9000 npm run dev`).

### Parity check (`npm run test:parity`)

Diffs the TypeScript strategy port against the original Python strategy in the
backend repo. It looks for the backend repo in a `backend/` folder next to this
one, or set `BACKEND_DIR` to its folder. Needs Python with the backend's
`requirements.txt` installed.

## Project structure

```
src/
  app/            AppShell, router, providers, theme tokens
  pages/          Route-level pages (RsiHaPage, IntradayPage)
  features/rsi-ha/  Feature-specific components (empty for now)
  strategy/       Ported indicator/signal logic (empty for now)
  data/           Mock API + mock WebSocket layer (empty for now)
  components/ui/  Design-system primitives (Button, Badge, Table, ...)
  lib/            Formatters, cn() classname helper, market-session logic
  types/          Shared TypeScript types (empty for now)
  store/          Zustand stores (empty for now)
```

See [CLAUDE.md](./CLAUDE.md) for the hard rules governing how this project
is built (strategy parity, no real network calls, no hardcoded business
numbers, strict TypeScript).
