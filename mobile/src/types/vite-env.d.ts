/// <reference types="vite/client" />

interface ImportMetaEnv {
    /* ─── API ─── */
    readonly VITE_API_BASE_URL: string;
    readonly VITE_API_TIMEOUT_MS: string;
    readonly VITE_API_MAX_RETRIES: string;

    /* ─── Auth & Security ─── */
    readonly VITE_AUTH_DOMAIN: string;
    readonly VITE_AUTH_CLIENT_ID: string;
    readonly VITE_AUTH_AUDIENCE: string;
    readonly VITE_JWT_ISSUER: string;
    readonly VITE_ENABLE_BIOMETRICS: string;        // facial capture on/off
    readonly VITE_GEOLOCATION_API_KEY: string;      // zero-trust geo-fencing
    readonly VITE_ENCRYPTION_KEY_ID: string;        // KMS key reference

    /* ─── App Metadata ─── */
    readonly VITE_APP_NAME: string;
    readonly VITE_APP_VERSION: string;
    readonly VITE_BUILD_HASH: string;
    readonly VITE_ENVIRONMENT: string;              // development | staging | production

    /* ─── Observability ─── */
    readonly VITE_SENTRY_DSN: string;
    readonly VITE_LOG_LEVEL: string;                // debug | info | warn | error
    readonly VITE_ENABLE_ANALYTICS: string;

    /* ─── Feature Flags ─── */
    readonly VITE_ENABLE_MOCKS: string;
    readonly VITE_ENABLE_ID_LIVENESS_CHECK: string; // passive liveness before submit
    readonly VITE_ENABLE_MANUAL_ID_FALLBACK: string; // "I don't have my ID" flow
    readonly VITE_ENABLE_RATE_LIMIT_UI: string;     // show countdown on 429

    /* ─── Third-party ─── */
    readonly VITE_GOOGLE_OAUTH_CLIENT_ID: string;
    readonly VITE_APPLE_SIGN_IN_CLIENT_ID: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}