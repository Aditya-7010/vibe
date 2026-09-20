/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Django backend, e.g. https://vibe-api.onrender.com */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
