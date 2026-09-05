// src/lib/env.ts
//
// Config resolution order:
//
//   1. window.__CONSOLE_CONFIG__  — written by docker-entrypoint.sh at
//      container start into /config.js, loaded before the bundle.
//   2. import.meta.env.VITE_*     — baked at build time, used by `npm run dev`.
//   3. defaults below.
//
// Vite inlines import.meta.env at BUILD time, so an image built with
// VITE_API_BASE_URL pointing at staging can never be promoted to prod.
// Layer 1 exists so the same artifact ships to every environment.

declare global {
    interface Window {
        __CONSOLE_CONFIG__?: Partial<Record<ConfigKey, string>>;
    }
}

type ConfigKey =
    | 'API_BASE_URL'
    | 'MANAGEMENT_PATH'
    | 'API_KEY'
    | 'GEO_FENCE'
    | 'CONSOLE_USERNAME'
    | 'CONSOLE_PASSWORD'
    | 'CONSOLE_SCOPE'
    | 'POLL_INTERVAL_MS';

const BUILD_TIME: Partial<Record<ConfigKey, string | undefined>> = {
    API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
    MANAGEMENT_PATH: import.meta.env.VITE_MANAGEMENT_PATH,
    API_KEY: import.meta.env.VITE_API_KEY,
    GEO_FENCE: import.meta.env.VITE_GEO_FENCE,
    CONSOLE_USERNAME: import.meta.env.VITE_CONSOLE_USERNAME,
    CONSOLE_PASSWORD: import.meta.env.VITE_CONSOLE_PASSWORD,
    CONSOLE_SCOPE: import.meta.env.VITE_CONSOLE_SCOPE,
    POLL_INTERVAL_MS: import.meta.env.VITE_POLL_INTERVAL_MS,
};

function read(key: ConfigKey, fallback = ''): string {
    const runtime = window.__CONSOLE_CONFIG__?.[key];

    // The entrypoint writes empty strings for unset vars; treat as absent.
    if (runtime) return runtime;

    return BUILD_TIME[key] || fallback;
}

export const env = {
    /**
     * Backend origin. Empty string means same-origin, which is the
     * container default: nginx reverse-proxies /api and /auth to the
     * API, so the browser never makes a cross-origin request and there
     * is no CORS surface to configure.
     */
    get apiBaseUrl(): string {
        return read('API_BASE_URL').replace(/\/$/, '');
    },

    get managementPath(): string {
        return read('MANAGEMENT_PATH', '/api/v1/management');
    },

    /** Tier-1 routes require X-API-Key. Mirrors EXPO_PUBLIC_API_KEY. */
    get apiKey(): string {
        return read('API_KEY');
    },

    get geoFence(): string {
        return read('GEO_FENCE', 'ZA-jnb');
    },

    get username(): string {
        return read('CONSOLE_USERNAME');
    },

    get password(): string {
        return read('CONSOLE_PASSWORD');
    },

    /** Read-only scopes. The console must never hold simswap:execute. */
    get scope(): string {
        return read('CONSOLE_SCOPE', 'biometric:read rica:read admin:docs');
    },

    get pollIntervalMs(): number {
        return Number(read('POLL_INTERVAL_MS', '15000'));
    },
};
