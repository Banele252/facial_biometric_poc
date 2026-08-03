// API client for the verification journey.
//
// Endpoints:
//   POST /api/v1/validate-id                 structural SA ID validation
//   POST /api/v1/selfies                     capture selfie (HT2-11)
//   POST /api/v1/selfies/{id}/liveness       liveness check (HT2-12)
//   POST /api/v1/verifications               orchestrated decision
//   GET  /api/v1/verifications/history       attempt history (HT2-14)
//   GET  /api/v1/notifications               in-app inbox (HT2-24/25)
//
// This used to return hardcoded successes without contacting anything, which
// made the app demo a journey the backend was never asked to run. It now calls
// the real API, so a rejection here is a rejection the backend decided.
//
// The device cannot reach "localhost" — that is the phone, not the machine
// running the API — so the host is configured rather than assumed. Set
// EXPO_PUBLIC_API_URL in mobile/.env to the LAN address of the API (for
// example http://192.168.1.20:8000). Expo inlines EXPO_PUBLIC_ variables at
// bundle time, so changing it needs a reload, and only static dot-notation
// references are substituted.

import { Platform } from 'react-native';

/** Android's emulator maps the host machine to 10.0.2.2; iOS simulators share
 *  the host's loopback. Neither helps on a physical device — set the env var. */
const DEFAULT_BASE_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_BASE_URL;

/** The two high-risk transactions the CARB names. They share the whole
 *  identity chain and differ only in what happens once it passes. */
export type TransactionKind = 'sim_swap' | 'number_port';

/** Which document the customer is presenting. A passport skips the SA ID
 *  checksum and the Home Affairs face match — Home Affairs holds no photo for
 *  a passport holder, so their identity rests on the document checks and RICA. */
export type DocumentKind = 'SA_ID' | 'PASSPORT';

/** "review" comes from the face match provider's "In Review" verdict — the
 *  journey is neither approved nor rejected and needs a human to finish it. */
export type DecisionStatus = 'approved' | 'rejected' | 'review';

export interface ValidationResponse {
  id_number_length: number;
  valid: boolean;
  checks: Record<string, boolean>;
  failed_checks: string[];
}

export interface SelfieResponse {
  selfie_id: string;
  content_type: string;
  size_bytes: number;
  liveness_status: string;
}

export interface LivenessResponse {
  selfie_id: string;
  is_live: boolean;
  score: number;
  provider: string;
  detail: string;
}

/** One step of the journey, in the order the backend ran it. */
export interface CheckResult {
  name: string;
  label: string;
  status: 'pass' | 'fail' | 'review' | 'skipped';
  detail: string;
  score: number | null;
}

export interface VerificationDecision {
  attempt_id: string;
  id_number: string;
  status: DecisionStatus;
  method: string;
  reason: string;
  provider_status: string | null;
  notification_type: string;
  /** Face match confidence, 0-100. Null when no match ran (e.g. a passport). */
  match_score: number | null;
  mode: string | null;
  document_type: DocumentKind;
  /** Issued only once every check has passed. Null on any other outcome. */
  authorisation_token: string | null;
  checks: CheckResult[];
}

export interface VerificationInput {
  id_number: string;
  selfie_id: string;
  /** Required — the journey refuses to start without it (RICA/POPIA). */
  consent: boolean;
  document_type: DocumentKind;
  /** Base64 data URL of the scanned ID or passport. Required. */
  document_image: string;
  full_name?: string;
  msisdn?: string;
  new_sim_number?: string;
  device_id?: string;
  imei?: string;
  transaction?: TransactionKind;
  target_network?: string;
}

export interface AttemptRecord {
  id: string;
  id_number: string;
  selfie_id: string | null;
  status: string;
  method: string;
  reason: string | null;
  provider_status: string | null;
  created_at: string;
}

export interface NotificationRecord {
  id: string;
  id_number: string;
  attempt_id: string | null;
  type: string;
  channel: string;
  message: string;
  created_at: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(`${API_BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch {
    // A network failure on a phone is nearly always the API host, so say so
    // rather than surfacing "Network request failed".
    throw new Error(
      `Could not reach the API at ${API_BASE_URL}. Check EXPO_PUBLIC_API_URL.`,
    );
  }

  if (!resp.ok) {
    const detail = await resp.json().catch(() => null);
    const msg =
      (typeof detail?.detail === 'string' && detail.detail) ||
      detail?.detail?.[0]?.msg ||
      `Request failed (HTTP ${resp.status})`;
    throw new Error(msg);
  }
  return resp.json() as Promise<T>;
}

export function validateId(idNumber: string): Promise<ValidationResponse> {
  return request('/api/v1/validate-id', {
    method: 'POST',
    body: JSON.stringify({ id_number: idNumber }),
  });
}

export function captureSelfie(idNumber: string, image: string): Promise<SelfieResponse> {
  return request('/api/v1/selfies', {
    method: 'POST',
    body: JSON.stringify({ id_number: idNumber, image }),
  });
}

export function checkLiveness(selfieId: string): Promise<LivenessResponse> {
  return request(`/api/v1/selfies/${selfieId}/liveness`, { method: 'POST' });
}

/**
 * Runs the whole journey server-side, in the order the process diagram sets
 * out: consent, ID precheck, liveness, fraud pre-checks, the three document
 * checks, RICA, Home Affairs, then the authorisation token and the swap.
 *
 * Takes ~12s in sandbox, because the provider rate-limits per IP and the
 * backend waits between its calls — callers must show a progress state.
 */
export function verifyIdentity(input: VerificationInput): Promise<VerificationDecision> {
  return request('/api/v1/verifications', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getHistory(idNumber: string): Promise<AttemptRecord[]> {
  return request(`/api/v1/verifications/history?id_number=${encodeURIComponent(idNumber)}`);
}

export function getNotifications(idNumber: string): Promise<NotificationRecord[]> {
  return request(`/api/v1/notifications?id_number=${encodeURIComponent(idNumber)}`);
}

/**
 * A stable per-install identifier for the fraud engine's repeat-device and
 * velocity checks. Deliberately random and local-only — it identifies the
 * device across attempts, not the person.
 */
let cachedDeviceId: string | null = null;

export function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;
  cachedDeviceId = `mobile-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  return cachedDeviceId;
}

export const CHECK_LABELS: Record<string, string> = {
  length_is_13: 'Is 13 digits long',
  is_numeric: 'Contains digits only',
  date_of_birth_plausible: 'Date of birth is plausible',
  citizenship_digit_valid: 'Citizenship digit is valid',
  race_digit_valid: '12th digit is valid',
  luhn_checksum: 'Passes Luhn checksum',
};
