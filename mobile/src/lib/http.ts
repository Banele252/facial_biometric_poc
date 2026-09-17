// src/lib/http.ts

import axios, {
    AxiosError,
    InternalAxiosRequestConfig,
} from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

const API_BASE_URL =
    process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

// Digital Trust platform tokens. The service token authenticates the app
// itself and is only ever used to obtain the user token; every journey call
// carries the user token.
export const ACCESS_TOKEN_KEY = 'dt.userAccessToken';
export const SERVICE_TOKEN_KEY = 'dt.serviceAccessToken';
export const USER_REFRESH_TOKEN_KEY = 'dt.userRefreshToken';
const DEVICE_ID_KEY = 'mtn.deviceId';

// ---------- web-safe storage helpers ----------

export async function storageGet(
    key: string,
): Promise<string | null> {
    if (Platform.OS === 'web') {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;
        }
    }

    try {
        return await SecureStore.getItemAsync(key);
    } catch {
        return AsyncStorage.getItem(key);
    }
}

export async function storageSet(
    key: string,
    value: string,
): Promise<void> {
    if (Platform.OS === 'web') {
        try {
            localStorage.setItem(key, value);
        } catch {
            // Ignore unavailable browser storage in sandbox.
        }

        return;
    }

    try {
        await SecureStore.setItemAsync(key, value);
    } catch {
        await AsyncStorage.setItem(key, value);
    }
}

export async function storageRemove(
    key: string,
): Promise<void> {
    if (Platform.OS === 'web') {
        try {
            localStorage.removeItem(key);
        } catch {
            // Ignore unavailable browser storage in sandbox.
        }

        return;
    }

    try {
        await SecureStore.deleteItemAsync(key);
    } catch {
        await AsyncStorage.removeItem(key);
    }
}

/** The persisted device identifier, also sent as X-Device-Fingerprint.
 *
 * Exported because the verification journey passes it in the request body as
 * `device_id`: the fraud engine's device-risk rules key off it, and a header
 * the middleware consumes is not visible to the route handler's payload.
 */
export async function getDeviceId(): Promise<string> {
    const existing = await storageGet(DEVICE_ID_KEY);

    if (existing) {
        return existing;
    }

    const prefix =
        Platform.OS === 'web'
            ? 'web'
            : Platform.OS;

    const created =
        `${prefix}-${Crypto.randomUUID()}`;

    await storageSet(
        DEVICE_ID_KEY,
        created,
    );

    return created;
}

// ---------- axios client ----------

export const http = axios.create({
    baseURL: API_BASE_URL,
    // The API runs on Container Apps with minReplicas 0, so the first request
    // after an idle period pays a cold start of roughly 15s. At the previous
    // 10s this surfaced as "Network Error" on the very first call - the token
    // bootstrap - and the journey then continued without a token, so the next
    // screen failed again with "Missing or invalid Authorization header".
    // The real failure was a timeout, and neither message said so.
    timeout: 45_000,
    headers: {
        Accept: 'application/json',
    },
});

/** Routes that mint a token, which must never be sent an existing one. */
function isAuthRoute(url: string): boolean {
    return url.startsWith('/v1/auth/');
}

/** Routes authenticated by the service token rather than the user token. */
function isServiceRoute(url: string): boolean {
    return url === '/v1/auth/user/login';
}

http.interceptors.request.use(
    async (
        config: InternalAxiosRequestConfig,
    ) => {
        const url =
            config.url ?? '';

        config.headers.set(
            'X-Correlation-Id',
            `mobile-${Crypto.randomUUID()}`,
        );

        // The platform authenticates on the bearer token alone. The PoC's
        // X-API-Key, X-Geo-Fence, X-Device-Fingerprint and X-Request-Nonce
        // headers were read by ZeroTrustMiddleware, which does not exist
        // here - sending them would suggest a guard that is not running. The
        // device identity the platform does act on travels in the request
        // body as `device.fingerprint`, where the rule packs can score it.
        if (isServiceRoute(url)) {
            const serviceToken =
                await storageGet(SERVICE_TOKEN_KEY);

            if (serviceToken) {
                config.headers.set(
                    'Authorization',
                    `Bearer ${serviceToken}`,
                );
            }

            return config;
        }

        if (!isAuthRoute(url)) {
            const token =
                await storageGet(ACCESS_TOKEN_KEY);

            if (token) {
                config.headers.set(
                    'Authorization',
                    `Bearer ${token}`,
                );
            }
        }

        return config;
    },
);

// ---------- error helpers ----------

export function getAxiosErrorBody(
    error: unknown,
): unknown {
    if (axios.isAxiosError(error)) {
        return (
            error as AxiosError
        ).response?.data;
    }

    return undefined;
}

type BackendErrorBody = {
    message?: string;
    detail?: string;
    error?: string;
    code?: string;
};

export function getApiErrorMessage(
    error: unknown,
): string {
    if (!axios.isAxiosError(error)) {
        return error instanceof Error
            ? error.message
            : 'Something went wrong. Please try again.';
    }

    const body =
        error.response?.data as
            | BackendErrorBody
            | undefined;

    if (body?.message) {
        return body.message;
    }

    if (body?.detail) {
        return body.detail;
    }

    if (body?.error) {
        return body.error;
    }

    if (error.code === 'ECONNABORTED') {
        return 'The request timed out. Please try again.';
    }

    if (!error.response) {
        return 'Unable to reach the service. Please check your connection and try again.';
    }

    return 'Unable to complete the request. Please try again.';
}