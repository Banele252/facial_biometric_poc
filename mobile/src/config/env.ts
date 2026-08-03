// src/config/env.ts

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type Environment = 'development' | 'staging' | 'production';

function getEnv(key: string, fallback?: string): string | undefined {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const viteKey = `VITE_${key}`;
    return import.meta.env[viteKey] ?? fallback;
  }
  if (typeof process !== 'undefined' && process.env) {
    const expoKey = `EXPO_PUBLIC_${key}`;
    return process.env[expoKey] ?? fallback;
  }
  return fallback;
}

function bool(raw?: string): boolean {
  return raw === 'true' || raw === '1';
}

function num(raw?: string, fallback = 0): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/* ───────────────────────────────────────── */

export const ENV = {
  /* API */
  API_BASE_URL: getEnv('API_BASE_URL', '/api')!,
  API_TIMEOUT_MS: num(getEnv('API_TIMEOUT_MS'), 30000),
  API_MAX_RETRIES: num(getEnv('API_MAX_RETRIES'), 3),

  /* Auth & Security */
  AUTH_DOMAIN: getEnv('AUTH_DOMAIN', ''),
  AUTH_CLIENT_ID: getEnv('AUTH_CLIENT_ID', ''),
  AUTH_AUDIENCE: getEnv('AUTH_AUDIENCE', ''),
  JWT_ISSUER: getEnv('JWT_ISSUER', ''),
  ENABLE_BIOMETRICS: bool(getEnv('ENABLE_BIOMETRICS')),
  GEOLOCATION_API_KEY: getEnv('GEOLOCATION_API_KEY', ''),
  ENCRYPTION_KEY_ID: getEnv('ENCRYPTION_KEY_ID', ''),

  /* App */
  APP_NAME: getEnv('APP_NAME', 'TrustPlatform'),
  APP_VERSION: getEnv('APP_VERSION', '0.0.0'),
  BUILD_HASH: getEnv('BUILD_HASH', 'dev'),
  ENVIRONMENT: (getEnv('ENVIRONMENT', 'development') as Environment),

  /* Observability */
  SENTRY_DSN: getEnv('SENTRY_DSN', ''),
  LOG_LEVEL: (getEnv('LOG_LEVEL', 'info') as LogLevel),
  ENABLE_ANALYTICS: bool(getEnv('ENABLE_ANALYTICS')),

  /* Feature Flags */
  ENABLE_MOCKS: bool(getEnv('ENABLE_MOCKS')),
  ENABLE_ID_LIVENESS_CHECK: bool(getEnv('ENABLE_ID_LIVENESS_CHECK')),
  ENABLE_MANUAL_ID_FALLBACK: bool(getEnv('ENABLE_MANUAL_ID_FALLBACK')),
  ENABLE_RATE_LIMIT_UI: bool(getEnv('ENABLE_RATE_LIMIT_UI')),

  /* OAuth */
  GOOGLE_OAUTH_CLIENT_ID: getEnv('GOOGLE_OAUTH_CLIENT_ID', ''),
  APPLE_SIGN_IN_CLIENT_ID: getEnv('APPLE_SIGN_IN_CLIENT_ID', ''),
} as const;

/* ─── runtime guards ─── */
if (!ENV.API_BASE_URL || ENV.API_BASE_URL === '/') {
  console.warn('[ENV] API_BASE_URL is not set. Requests may fail.');
}
if (ENV.ENVIRONMENT === 'production' && !ENV.SENTRY_DSN) {
  console.warn('[ENV] SENTRY_DSN missing in production build.');
}