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

const GEO_FENCE =
    process.env.EXPO_PUBLIC_GEO_FENCE ?? 'ZA-jnb';

const POC_API_KEY =
    process.env.EXPO_PUBLIC_API_KEY ?? '';

export const ACCESS_TOKEN_KEY = 'biometric.accessToken';
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

async function getDeviceId(): Promise<string> {
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
    timeout: 10_000,
    headers: {
        Accept: 'application/json',
    },
});

http.interceptors.request.use(
    async (
        config: InternalAxiosRequestConfig,
    ) => {
        const token =
            await storageGet(ACCESS_TOKEN_KEY);

        const deviceId =
            await getDeviceId();

        const url =
            config.url ?? '';

        const isTokenRequest =
            url === '/auth/token' ||
            url.endsWith('/auth/token');

        config.headers.set(
            'X-Correlation-Id',
            `mobile-${Crypto.randomUUID()}`,
        );

        config.headers.set(
            'X-Device-Fingerprint',
            deviceId,
        );

        config.headers.set(
            'X-Geo-Fence',
            GEO_FENCE,
        );

        const method =
            (config.method ?? 'get')
                .toLowerCase();

        if (
            ['post', 'put', 'patch', 'delete']
                .includes(method)
        ) {
            config.headers.set(
                'X-Request-Nonce',
                Crypto.randomUUID(),
            );
        }

        // Never send an old JWT while obtaining a new one.
        if (token && !isTokenRequest) {
            config.headers.set(
                'Authorization',
                `Bearer ${token}`,
            );
        }

        // Local / sandbox PoC only.
        // Tier-1 routes such as RICA and SIM Swap require X-API-Key.
        if (POC_API_KEY && !isTokenRequest) {
            config.headers.set(
                'X-API-Key',
                POC_API_KEY,
            );
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