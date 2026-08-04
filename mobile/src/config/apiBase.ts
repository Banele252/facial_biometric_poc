// Where the API lives — one definition, imported everywhere.
//
// This was previously inlined in six screens, each repeating
// `process.env.EXPO_PUBLIC_API_BASE_URL || '<a hardcoded host>'`. That host was
// a retired App Service which now answers 403, so any build where the
// environment variable was not inlined silently talked to a dead backend and
// every call failed. Six copies also meant six places to miss when the
// deployment moved.
//
// Expo substitutes EXPO_PUBLIC_ variables at bundle time and only for *static*
// dot-notation references, which is why this reads the variable exactly once,
// in one place, rather than through a helper.

const FALLBACK = 'https://team21-ca.livelycoast-bbf4360d.southafricanorth.azurecontainerapps.io';

/**
 * Base URL for every API call. Set EXPO_PUBLIC_API_BASE_URL in mobile/.env to
 * point at a different environment — a local API, or a future deployment. The
 * fallback is the currently deployed Container App, so a build without a .env
 * still reaches a live backend instead of failing obscurely.
 *
 * A trailing slash here would produce `//api/v1/...` once joined, so it is
 * stripped rather than trusted.
 */
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || FALLBACK).replace(/\/+$/, '');

/** Join a path onto the base URL. Accepts paths with or without a leading slash. */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}/${path.replace(/^\/+/, '')}`;
}
