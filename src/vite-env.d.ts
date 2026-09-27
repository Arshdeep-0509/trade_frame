/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Test hook — see seedFromEnv() in src/app/dataSource.ts. */
  readonly VITE_SEED?: string
  readonly VITE_MOCK_FAILURE_RATE?: string
  /** Where /intraday's HttpMarketDataSource sends /api/* requests. Unset = same origin (the Vite proxy). */
  readonly VITE_INTRADAY_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
