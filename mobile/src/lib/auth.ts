// src/lib/auth.ts
import {
  ACCESS_TOKEN_KEY,
  http,
  storageGet,
  storageRemove,
  storageSet,
} from './http';

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  token_id: string;
  device_binding?: string | null;
  geo_fence?: string | null;
}

const SANDBOX_USERNAME = 'test_admin';
const SANDBOX_PASSWORD = process.env.EXPO_PUBLIC_SANDBOX_PASSWORD ?? '';
const SANDBOX_SCOPE =
    'biometric:read biometric:write simswap:execute rica:read admin:docs';

export async function loginSandbox(
    username = SANDBOX_USERNAME,
    password = SANDBOX_PASSWORD,
    scope = SANDBOX_SCOPE,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    username,
    password,
    scope,
  });

  const { data } = await http.post<TokenResponse>(
      '/auth/token',
      body.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
  );

  await storageSet(
      ACCESS_TOKEN_KEY,
      data.access_token,
  );

  return data;
}

export async function getAccessToken(): Promise<string | null> {
  return storageGet(ACCESS_TOKEN_KEY);
}

/**
 * PoC bootstrap:
 * Always obtain a fresh short-lived sandbox JWT before LandingScreen.
 * This deliberately avoids stale/expired tokens between demo runs.
 */
export async function bootstrapSandboxAuth(): Promise<TokenResponse> {
  await storageRemove(ACCESS_TOKEN_KEY);
  return loginSandbox();
}

export async function logout(): Promise<void> {
  await storageRemove(ACCESS_TOKEN_KEY);
}