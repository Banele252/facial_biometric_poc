/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_BASE_URL?: string;
    readonly VITE_MANAGEMENT_PATH?: string;
    readonly VITE_API_KEY?: string;
    readonly VITE_GEO_FENCE?: string;
    readonly VITE_CONSOLE_USERNAME?: string;
    readonly VITE_CONSOLE_PASSWORD?: string;
    readonly VITE_CONSOLE_SCOPE?: string;
    readonly VITE_POLL_INTERVAL_MS?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
