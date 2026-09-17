// src/lib/auth.ts
//
// Authentication against the Digital Trust platform.
//
// The platform issues two tokens, and the distinction matters:
//
//   * the **service token** authenticates the application to a tenant
//     (OpCo). It is obtained from `/v1/auth/tenant/login` with the tenant's
//     id and secret, and its only use here is to authorise the user login.
//   * the **user token** authenticates the customer. It is obtained from
//     `/v1/auth/user/login` while presenting the service token, and it is
//     what every journey call carries.
//
// The previous PoC posted a form-encoded username and password to
// `/auth/token` and got back a single JWT. That endpoint does not exist on
// the platform, and neither does the synthetic PoC user context that
// ZeroTrustMiddleware used to inject when `AUTH_ENABLED=false` - every route
// here requires a real bearer token.

import {
  ACCESS_TOKEN_KEY,
  http,
  SERVICE_TOKEN_KEY,
  storageGet,
  storageRemove,
  storageSet,
  USER_REFRESH_TOKEN_KEY,
} from './http';

export interface TenantTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  refresh_expires_in: number;
  token_kind: string;
  session_id: string;
}

export interface UserTokenResponse extends TenantTokenResponse {
  subject: string;
  tenant_id: string;
}

/** The OpCo this build is bound to. */
const TENANT_ID =
    process.env.EXPO_PUBLIC_TENANT_ID ?? '';

const TENANT_SECRET =
    process.env.EXPO_PUBLIC_TENANT_SECRET ?? '';

/**
 * The demo customer.
 *
 * A production app authenticates the subscriber on the handset's own MSISDN
 * and a PIN they set. There is no such enrolment in this build, so the
 * demo identity comes from the environment and the journey screens collect
 * the MSISDN separately for the SIM swap itself.
 */
const DEMO_MSISDN =
    process.env.EXPO_PUBLIC_DEMO_MSISDN ?? '';

const DEMO_PIN =
    process.env.EXPO_PUBLIC_DEMO_PIN ?? '';

export class AuthConfigurationError extends Error {
  constructor(missing: string[]) {
    super(
        `Missing platform credentials: ${missing.join(', ')}. ` +
        'Set them in mobile/.env before starting the app.',
    );
    this.name = 'AuthConfigurationError';
  }
}

function assertConfigured(): void {
  const missing = [
    ['EXPO_PUBLIC_TENANT_ID', TENANT_ID],
    ['EXPO_PUBLIC_TENANT_SECRET', TENANT_SECRET],
    ['EXPO_PUBLIC_DEMO_MSISDN', DEMO_MSISDN],
    ['EXPO_PUBLIC_DEMO_PIN', DEMO_PIN],
  ]
      .filter(([, value]) => !value)
      .map(([name]) => name as string);

  if (missing.length > 0) {
    throw new AuthConfigurationError(missing);
  }
}

/** Authenticate the application to its OpCo and persist the service token. */
export async function loginTenant(): Promise<TenantTokenResponse> {
  const { data } = await http.post<TenantTokenResponse>(
      '/v1/auth/tenant/login',
      {
        tenant_id: TENANT_ID,
        tenant_secret: TENANT_SECRET,
      },
  );

  await storageSet(
      SERVICE_TOKEN_KEY,
      data.access_token,
  );

  return data;
}

/**
 * Authenticate the customer.
 *
 * Requires a service token in storage; the request interceptor attaches it.
 */
export async function loginUser(
    msisdn = DEMO_MSISDN,
    pin = DEMO_PIN,
): Promise<UserTokenResponse> {
  const { data } = await http.post<UserTokenResponse>(
      '/v1/auth/user/login',
      {
        msisdn,
        pin,
      },
  );

  await storageSet(
      ACCESS_TOKEN_KEY,
      data.access_token,
  );

  await storageSet(
      USER_REFRESH_TOKEN_KEY,
      data.refresh_token,
  );

  return data;
}

export async function getAccessToken(): Promise<string | null> {
  return storageGet(ACCESS_TOKEN_KEY);
}

/**
 * Exchange the stored refresh token for a new user token.
 *
 * The user token is short-lived (15 minutes by default) and the journey can
 * outlast it while the customer is in the camera flow.
 */
export async function refreshUserToken(): Promise<UserTokenResponse | null> {
  const refreshToken =
      await storageGet(USER_REFRESH_TOKEN_KEY);

  if (!refreshToken) {
    return null;
  }

  const { data } = await http.post<UserTokenResponse>(
      '/v1/auth/user/refresh',
      {
        refresh_token: refreshToken,
      },
  );

  await storageSet(
      ACCESS_TOKEN_KEY,
      data.access_token,
  );

  await storageSet(
      USER_REFRESH_TOKEN_KEY,
      data.refresh_token,
  );

  return data;
}

/**
 * Obtain both tokens before the journey starts.
 *
 * Always mints a fresh pair: a stale token from a previous demo run fails
 * mid-journey, where the error surfaces as an unrelated step failing.
 */
export async function bootstrapAuth(): Promise<UserTokenResponse> {
  assertConfigured();

  await logout();
  await loginTenant();

  return loginUser();
}

export async function logout(): Promise<void> {
  await storageRemove(ACCESS_TOKEN_KEY);
  await storageRemove(SERVICE_TOKEN_KEY);
  await storageRemove(USER_REFRESH_TOKEN_KEY);
}
