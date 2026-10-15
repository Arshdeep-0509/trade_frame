/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Test hook — see seedFromEnv() in src/app/dataSource.ts. */
  /** Where /intraday's HttpMarketDataSource sends /api/* requests. Unset = same origin (the Vite proxy). */
  readonly VITE_INTRADAY_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
