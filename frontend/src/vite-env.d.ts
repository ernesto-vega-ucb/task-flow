/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_APP_VERSION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Versión global de la plataforma inyectada en runtime por el contenedor
// (public/version.js regenerado por docker-entrypoint.d en cada arranque).
interface Window {
  __APP_VERSION__?: string;
}
