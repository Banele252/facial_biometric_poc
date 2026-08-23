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

export interface FaceMatchResponse {
  match: boolean;
  score: number;
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
export interface InitiateSwapRequest {
  id_number: string;
  msisdn: string;
  iccid: string;
  selfie_id?: string;
  device_id?: string;
}

export interface InitiateSwapResponse {
  order_id: string;
  status: 'pending' | 'approved' | 'rejected';
  reference: string;
  message: string;
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
  if (!path.startsWith('/api/') && !path.startsWith('/auth/')) {
    throw new Error(`API path must start with "/api/" or "/auth/": ${path}`);
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
  return request<ValidationResponse>('/api/v1/validate-id', {
    method: 'POST',
    body: JSON.stringify({ id_number: idNumber }),
  });
}

/*  selfies  */
export function captureSelfie(idNumber: string, image: string): Promise<SelfieResponse> {
  return request<SelfieResponse>('/api/v1/selfies', {
    method: 'POST',
    body: JSON.stringify({ id_number: idNumber, image }),
  });
}

export function checkLiveness(selfieId: string): Promise<LivenessResponse> {
  return request<LivenessResponse>(`/api/v1/selfies/${encodeURIComponent(selfieId)}/liveness`, { method: 'POST' });
}

/*  face match  */
export function faceMatch(selfieId: string, idNumber: string): Promise<FaceMatchResponse> {
  return request<FaceMatchResponse>('/api/v1/face-match', {
    method: 'POST',
    body: JSON.stringify({ selfie_id: selfieId, id_number: idNumber }),
  });
}

/*  verification  */
export function verifyIdentity(input: VerificationInput): Promise<VerificationDecision> {
  return request<VerificationDecision>('/api/v1/verifications', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getHistory(idNumber: string): Promise<AttemptRecord[]> {
  return request<AttemptRecord[]>('/api/v1/verifications/history', {
    method: 'POST',
    body: JSON.stringify({ id_number: idNumber }),
    headers: { 'Content-Type': 'application/json' },
  });
}

/*  notifications  */
export function getNotifications(idNumber: string): Promise<NotificationRecord[]> {
  return request<NotificationRecord[]>('/api/v1/notifications', {
    method: 'POST',
    body: JSON.stringify({ id_number: idNumber }),
    headers: { 'Content-Type': 'application/json' },
  });
}

/*  SIM swap  */
export function initiateSimSwap(payload: InitiateSwapRequest): Promise<InitiateSwapResponse> {
  return request<InitiateSwapResponse>('/api/v1/sim-swap/initiate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function createSimSwapOrder(payload: CreateOrderRequest): Promise<SimSwapOrder> {
  return request<SimSwapOrder>('/api/v1/sim-swap/create', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getSimSwapOrder(orderId: string): Promise<SimSwapOrder> {
  return request<SimSwapOrder>(`/api/v1/sim-swap/${encodeURIComponent(orderId)}`, { method: 'GET' });
}

export function activateSimSwapOrder(orderId: string): Promise<SimSwapOrder> {
  return request<SimSwapOrder>(`/api/v1/sim-swap/${encodeURIComponent(orderId)}/activate`, { method: 'POST' });
}

/*  ICCID  */
export function resolveIccid(payload: IccidResolveRequest): Promise<IccidResolveResponse> {
  return request<IccidResolveResponse>('/api/v1/iccid/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function extractIccid(imageBase64: string): Promise<IccidResolveResponse> {
  return resolveIccid({ image_base64: imageBase64 });
}