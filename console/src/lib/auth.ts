// src/lib/auth.ts
//
// Same /auth/token flow the mobile app uses, with a read-only scope set.

import {
    ACCESS_TOKEN_KEY,
    http,
    setReauthenticator,
    storageGet,
    storageRemove,
    storageSet,
} from './http';
import { env } from './env';

export interface TokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
    token_id: string;
    device_binding?: string | null;
    geo_fence?: string | null;
}

export async function login(
    username = env.username,
    password = env.password,
    scope = env.scope,
): Promise<TokenResponse> {
    const body = new URLSearchParams({ username, password, scope });

    const { data } = await http.post<TokenResponse>(
        '/auth/token',
        body.toString(),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        },
    );

    storageSet(ACCESS_TOKEN_KEY, data.access_token);
    return data;
}

export function getAccessToken(): string | null {
    return storageGet(ACCESS_TOKEN_KEY);
}

/**
 * Discard any stale token and obtain a fresh one.
 * Called once at startup and again on a 401.
 */
export async function bootstrapAuth(): Promise<TokenResponse> {
    storageRemove(ACCESS_TOKEN_KEY);
    return login();
}

export function logout(): void {
    storageRemove(ACCESS_TOKEN_KEY);
}

// Wire the 401 retry path in http.ts without a circular import.
setReauthenticator(async () => {
    await bootstrapAuth();
});
