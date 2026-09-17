// src/lib/http.ts
//
// Web counterpart to the mobile app's src/lib/http.ts.
// The backend enforces the same header contract on both clients, so the
// header set here is deliberately identical to the Expo interceptor:
//
//   X-Correlation-Id      per request
//   X-Device-Fingerprint  stable per browser profile
//   X-Geo-Fence           deployment region
//   X-Request-Nonce       mutations only
//   Authorization         bearer, never on /auth/token
//   X-API-Key             tier-1 routes, never on /auth/token

import axios, {
    AxiosError,
    InternalAxiosRequestConfig,
} from 'axios';
import { env } from './env';

export const ACCESS_TOKEN_KEY = 'console.accessToken';
const DEVICE_ID_KEY = 'console.deviceId';

// ---------- storage helpers ----------
// Browser-only, but wrapped so that a locked-down profile (Safari private
// mode, third-party cookie blocking in an iframe) degrades instead of throwing.

export function storageGet(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

export function storageSet(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        /* storage unavailable — token stays in-memory for this tab only */
    }
}

export function storageRemove(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch {
        /* no-op */
    }
}

function randomId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return crypto.randomUUID();
    }
    // Non-secure context fallback (plain http on a LAN IP).
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

function getDeviceId(): string {
    const existing = storageGet(DEVICE_ID_KEY);
    if (existing) return existing;

    const created = `console-${randomId()}`;
    storageSet(DEVICE_ID_KEY, created);
    return created;
}

// ---------- client ----------

export const http = axios.create({
    baseURL: env.apiBaseUrl,
    timeout: 15_000,
    headers: { Accept: 'application/json' },
});

function isTokenRequest(url: string | undefined): boolean {
    return (url ?? '').endsWith('/auth/token');
}

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = storageGet(ACCESS_TOKEN_KEY);
    const tokenRequest = isTokenRequest(config.url);

    config.headers.set('X-Correlation-Id', `console-${randomId()}`);
    config.headers.set('X-Device-Fingerprint', getDeviceId());
    config.headers.set('X-Geo-Fence', env.geoFence);

    const method = (config.method ?? 'get').toLowerCase();
    if (['post', 'put', 'patch', 'delete'].includes(method)) {
        config.headers.set('X-Request-Nonce', randomId());
    }

    if (token && !tokenRequest) {
        config.headers.set('Authorization', `Bearer ${token}`);
    }

    if (env.apiKey && !tokenRequest) {
        config.headers.set('X-API-Key', env.apiKey);
    }

    return config;
});

// ---------- 401 handling ----------
//
// The previous client redirected to /login, which does not exist in this
// app and produced a blank page. Instead: re-bootstrap the service-account
// token once and replay the request. A second 401 is surfaced to the caller
// so the UI can show a real error.

type RetryableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

let refreshInFlight: Promise<void> | null = null;

/** Injected by auth.ts to avoid a circular import. */
let reauthenticate: (() => Promise<void>) | null = null;

export function setReauthenticator(fn: () => Promise<void>): void {
    reauthenticate = fn;
}

http.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const config = error.config as RetryableConfig | undefined;

        const shouldRetry =
            error.response?.status === 401 &&
            config &&
            !config._retried &&
            !isTokenRequest(config.url) &&
            reauthenticate;

        if (!shouldRetry) {
            return Promise.reject(error);
        }

        config._retried = true;

        try {
            // Collapse concurrent 401s into one token request.
            refreshInFlight = refreshInFlight ?? reauthenticate!();
            await refreshInFlight;
        } catch (refreshError) {
            refreshInFlight = null;
            return Promise.reject(refreshError);
        }

        refreshInFlight = null;
        return http.request(config);
    },
);

// ---------- error helpers ----------

type BackendErrorBody = {
    message?: string;
    detail?: string | Array<{ loc?: Array<string | number>; msg?: string }>;
    error?: string;
    code?: string;
};

export function getApiErrorMessage(error: unknown): string {
    if (!axios.isAxiosError(error)) {
        return error instanceof Error
            ? error.message
            : 'Something went wrong. Please try again.';
    }

    const body = error.response?.data as BackendErrorBody | undefined;

    if (body?.message) return body.message;

    if (typeof body?.detail === 'string') return body.detail;

    if (Array.isArray(body?.detail)) {
        return body.detail
            .map((item) => {
                const field = item.loc
                    ?.filter((part) => part !== 'body')
                    .join('.');
                const msg = item.msg ?? 'Invalid value';
                return field ? `${field}: ${msg}` : msg;
            })
            .join('\n');
    }

    if (body?.error) return body.error;

    if (error.code === 'ECONNABORTED') {
        return 'The request timed out. Please try again.';
    }

    if (!error.response) {
        return 'Unable to reach the service. Check that the API is running and reachable.';
    }

    if (error.response.status === 401 || error.response.status === 403) {
        return 'The console is not authorised to read this data. Check the service-account scopes.';
    }

    return `Request failed with status ${error.response.status}.`;
}

/** GET against the management read surface. */
export async function managementGet<T>(
    path: string,
    params?: Record<string, unknown>,
): Promise<T> {
    const { data } = await http.get<T>(`${env.managementPath}${path}`, {
        params,
    });
    return data;
}

/** POST against the management surface. */
export async function managementPost<T>(
    path: string,
    body: unknown,
): Promise<T> {
    const { data } = await http.post<T>(
        `${env.managementPath}${path}`,
        body,
        { headers: { 'Content-Type': 'application/json' } },
    );
    return data;
}
