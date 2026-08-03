// src/shared/api.ts
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? '';
const REQUEST_TIMEOUT_MS = 120_000;

export type TransactionKind = 'sim_swap' | 'number_port';

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
  /** Required. RICA and POPIA both need the customer's consent before any
   *  check runs, and the backend refuses the journey without it. */
  consent: boolean;
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
    if (typeof firstError === 'object' && firstError !== null && 'msg' in firstError
        && typeof firstError.msg === 'string') {
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
  if (!path.startsWith('/api/')) {
    throw new Error(`API path must start with "/api/": ${path}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const externalSignal = init.signal;
  let onAbort: (() => void) | null = null;

  if (externalSignal) {
    onAbort = () => controller.abort();
    externalSignal.addEventListener('abort', onAbort);
    if (externalSignal.aborted) controller.abort();
  }

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...init.headers,
      },
      signal: controller.signal,
    });

    const responseText = await response.text();
    let responseBody: unknown = null;
    if (responseText.trim().length > 0) {
      try { responseBody = JSON.parse(responseText); } catch { responseBody = responseText; }
    }

    if (!response.ok) {
      const message = extractMessage(responseBody) ?? `Request failed with HTTP ${response.status}`;
      throw new ApiError(response.status, response.statusText, responseBody ?? message);
    }
    return responseBody as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(0,
        'Request timed out', `The request exceeded ${REQUEST_TIMEOUT_MS} ms`);
    }
    if (error instanceof Error) throw new ApiError(0, 'Network error', error.message);
    throw new ApiError(0, 'Network error', error);
  } finally {
    clearTimeout(timeout);
    if (externalSignal && onAbort) externalSignal.removeEventListener('abort', onAbort);
  }
}

export async function getDeviceId(): Promise<string> {
  const storageKey = 'mtn.deviceId';
  if (Platform.OS === 'web') {
    try {
      const existingId = localStorage.getItem(storageKey);
      if (existingId) return existingId;
      const newId = `web-${crypto.randomUUID()}`;
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

export function validateId(idNumber: string): Promise<ValidationResponse> {
  return request<ValidationResponse>('/api/v1/validate-id', {
    method: 'POST',
    body: JSON.stringify({ id_number: idNumber }),
  });
}

export function captureSelfie(idNumber: string, image: string): Promise<SelfieResponse> {
  return request<SelfieResponse>('/api/v1/selfies', {
    method: 'POST',
    body: JSON.stringify({ id_number: idNumber, image }),
  });
}

export function checkLiveness(selfieId: string): Promise<LivenessResponse> {
  return request<LivenessResponse>(`/api/v1/selfies/${encodeURIComponent(selfieId)}/liveness`, { method: 'POST' });
}

export function verifyIdentity(input: VerificationInput): Promise<VerificationDecision> {
  return request<VerificationDecision>('/api/v1/verifications', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getHistory(idNumber: string): Promise<AttemptRecord[]> {
  const query = new URLSearchParams({ id_number: idNumber });
  return request<AttemptRecord[]>(`/api/v1/verifications/history?${query.toString()}`, { method: 'GET' });
}

export function getNotifications(idNumber: string): Promise<NotificationRecord[]> {
  const query = new URLSearchParams({ id_number: idNumber });
  return request<NotificationRecord[]>(`/api/v1/notifications?${query.toString()}`, { method: 'GET' });
}