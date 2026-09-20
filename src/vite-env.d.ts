/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Empty = same origin (dev proxy). A URL = that API. Absent = boot error;
   * the console never guesses a backend. See resolveBaseUrl in api/client.ts.
   */
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_PROXY_TARGET?: string;
  readonly VITE_ENABLE_SIMULATOR?: string;
  readonly VITE_USE_MSW?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
