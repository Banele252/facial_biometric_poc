// src/shared/api.ts
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { http } from '@/lib/http';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

export type TransactionKind = 'sim_swap' | 'number_port';

/*  responses  */
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

export type DecisionStatus = 'approved' | 'rejected' | 'review';

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
  match_score: number | null;
  mode: string | null;
  checks: CheckResult[];
}

export interface VerificationInput {
  id_number: string;
  selfie_id: string;
  full_name?: string;
  msisdn?: string;
  new_sim_number?: string;
  device_id?: string;
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

/*  SIM swap  */
export interface SwapConsent {
  granted: true;
  text_version: string;
  captured_at: string;
}

export interface SwapDevice {
  fingerprint: string;
  platform: 'android' | 'ios' | 'web';
  attested?: boolean;
  rooted_or_jailbroken?: boolean;
}

export interface InitiateSwapRequest {
  id_number: string;
  msisdn: string;
  iccid: string;
  selfie_id?: string;
  /** Required: the platform denies the order without recorded consent, and
   *  the rule packs score the device signals. */
  consent: SwapConsent;
  device: SwapDevice;
  channel?: 'app' | 'ussd' | 'store' | 'call_centre';
  /** Client-generated and stable across retries: a SIM swap is not safe to
   *  repeat, so the server must be able to recognise the same request. */
  idempotency_key: string;
}

export interface InitiateSwapResponse {
  order_id: string;
  /** The platform's order status, not a transport result. */
  status: 'pending_verification' | 'in_review' | 'denied';
  reference: string;
  message: string;
}

export interface FaceMatchResponse {
  selfie_id: string;
  matched: boolean;
  status: string;
  score: number;
  provider: string;
  detail: string;
}

export interface CreateOrderRequest {
  id_number: string;
  msisdn: string;
  iccid: string;
  selfie_id?: string;
}

export interface SimSwapOrder {
  order_id: string;
  id_number: string;
  msisdn: string;
  iccid: string;
  status: string;
  reference: string;
  created_at: string;
  updated_at: string;
}

/*  ICCID  */
export interface IccidResolveRequest {
  iccid?: string;
  image_base64?: string;
}

export interface IccidResolveResponse {
  iccid: string;
  raw: string;
  barcode_type: string;
  source: 'manual' | 'barcode_scan';
}

export const CHECK_LABELS: Record<string, string> = {
  length_is_13: 'Is 13 digits long',
  is_numeric: 'Contains digits only',
  date_of_birth_plausible: 'Date of birth is plausible',
  citizenship_digit_valid: 'Citizenship digit is valid',
  race_digit_valid: '12th digit is valid',
  luhn_checksum: 'Passes Luhn checksum',
};

export class ApiError extends Error {
  constructor(
      public readonly status: number,
      public readonly statusText: string,
      public readonly body: unknown,
  ) {
    super(`API ${status}: ${statusText}`);
    this.name = 'ApiError';
  }
}

function extractMessage(detail: unknown): string | null {
  if (detail === null || detail === undefined) return null;
  if (typeof detail === 'string') return detail;
  if (typeof detail !== 'object') return null;
  const responseBody = detail as Record<string, unknown>;
  if (typeof responseBody.detail === 'string') return responseBody.detail;
  if (Array.isArray(responseBody.detail) && responseBody.detail.length > 0) {
    const firstError = responseBody.detail[0];
    if (typeof firstError === 'object' && firstError !== null && 'msg' in firstError && typeof firstError.msg === 'string') {
      return firstError.msg;
    }
  }
  if (typeof responseBody.message === 'string') return responseBody.message;
  return null;
}

export async function request<T>(
    path: string,
    init: RequestInit = {},
): Promise<T> {
  // The platform serves everything under /v1. The PoC's /api/v1 prefix is
  // still accepted so a configured audit ingest can point at an older
  // backend, but nothing in this app targets it by default.
  if (!path.startsWith('/v1/') && !path.startsWith('/api/')) {
    throw new Error(`API path must start with "/v1/" or "/api/": ${path}`);
  }

  try {
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    let data: unknown = init.body;

    if (typeof init.body === 'string' && headers['content-type']?.includes('application/json')) {
      try { data = JSON.parse(init.body); } catch { data = init.body; }
    }

    const response = await http.request<T>({
      url: path,
      method: (init.method ?? 'GET').toLowerCase(),
      headers,
      data,
      signal: init.signal ?? undefined,
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 0;
      const body = error.response?.data ?? error.message;
      const message = extractMessage(body) ?? error.message ?? 'Network error';
      throw new ApiError(status, error.response?.statusText ?? message, body);
    }
    if (error instanceof ApiError) throw error;
    if (error instanceof Error) throw new ApiError(0, 'Network error', error.message);
    throw new ApiError(0, 'Network error', error);
  }
}

export async function getDeviceId(): Promise<string> {
  const storageKey = 'mtn.deviceId';
  if (Platform.OS === 'web') {
    try {
      const existingId = localStorage.getItem(storageKey);
      if (existingId) return existingId;
      const newId = `web-${Date.now()}-${Math.random().toString(36).slice(2, 15)}`;
      localStorage.setItem(storageKey, newId);
      return newId;
    } catch { return 'web-unavailable'; }
  }
  try {
    const existingId = await AsyncStorage.getItem(storageKey);
    if (existingId) return existingId;
    const newId = `native-${Date.now()}-${Math.random().toString(36).slice(2, 15)}`;
    await AsyncStorage.setItem(storageKey, newId);
    return newId;
  } catch { return 'native-unavailable'; }
}

/*  identity  */
export function validateId(idNumber: string): Promise<ValidationResponse> {
  return request<ValidationResponse>('/v1/validate-id', {
    method: 'POST',
    body: JSON.stringify({ id_number: idNumber }),
  });
}

/*  selfies  */
export function captureSelfie(idNumber: string, image: string): Promise<SelfieResponse> {
  return request<SelfieResponse>('/v1/selfies', {
    method: 'POST',
    body: JSON.stringify({ id_number: idNumber, image }),
  });
}

export function checkLiveness(selfieId: string, sessionId: string): Promise<LivenessResponse> {
  return request<LivenessResponse>(`/v1/selfies/${encodeURIComponent(selfieId)}/liveness`, {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId }),
  });
}

/*  face match
 *
 *  Unlike the PoC, the platform serves this as its own endpoint rather than
 *  folding it into an orchestrator. `apiClient.matchFace` is what the journey
 *  uses; this layer is kept only for the hooks that still import from it.
 */
export function faceMatch(selfieId: string, idNumber: string): Promise<FaceMatchResponse> {
  return request<FaceMatchResponse>(`/v1/selfies/${encodeURIComponent(selfieId)}/match`, {
    method: 'POST',
    body: JSON.stringify({ id_number: idNumber }),
  });
}

/*  verification
 *
 *  The PoC's POST /api/v1/verifications ran every check and returned one
 *  decision, and /verifications/history and /notifications read its records.
 *  The platform composes that journey from `/v1/selfies/{id}/match` and
 *  `/v1/sim-swap/initiate`, and keeps its evidence in the tenant audit chain
 *  at `/v1/audit/*` rather than in per-attempt tables. Those three helpers
 *  had no endpoint to point at and nothing called them, so they are gone
 *  rather than left to 404 - `apiClient.runVerificationJourney` is the
 *  replacement for the first, and the console reads the audit chain for the
 *  other two.
 */

/*  SIM swap  */
export function initiateSimSwap(payload: InitiateSwapRequest): Promise<InitiateSwapResponse> {
  const { idempotency_key: idempotencyKey, ...body } = payload;

  return request<InitiateSwapResponse>('/v1/sim-swap/initiate', {
    method: 'POST',
    body: JSON.stringify({ channel: 'app', ...body }),
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

export function getSimSwapOrder(orderId: string): Promise<SimSwapOrder> {
  return request<SimSwapOrder>(`/v1/sim-swap/orders/${encodeURIComponent(orderId)}`, { method: 'GET' });
}

/*  ICCID  */
export function resolveIccid(payload: IccidResolveRequest): Promise<IccidResolveResponse> {
  return request<IccidResolveResponse>('/v1/iccid/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function extractIccid(imageBase64: string): Promise<IccidResolveResponse> {
  return resolveIccid({ image_base64: imageBase64 });
}
