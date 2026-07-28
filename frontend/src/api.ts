// API client for the verification journey.
//
// Endpoints:
//   POST /api/v1/validate-id                 structural SA ID validation
//   POST /api/v1/selfies                     capture selfie (HT2-11)
//   POST /api/v1/selfies/{id}/liveness       liveness check (HT2-12)
//   POST /api/v1/verifications               orchestrated decision (HT2-15)
//   GET  /api/v1/verifications/history       attempt history (HT2-14)
//   GET  /api/v1/notifications               in-app inbox (HT2-24/25)

export interface ValidationResponse {
  id_number_length: number
  valid: boolean
  checks: Record<string, boolean>
  failed_checks: string[]
}

export interface SelfieResponse {
  selfie_id: string
  content_type: string
  size_bytes: number
  liveness_status: string
}

export interface LivenessResponse {
  selfie_id: string
  is_live: boolean
  score: number
  provider: string
  detail: string
}

export interface VerificationDecision {
  attempt_id: string
  id_number: string
  status: 'approved' | 'rejected'
  method: string
  reason: string
  provider_status: string | null
  notification_type: string
}

export interface AttemptRecord {
  id: string
  id_number: string
  selfie_id: string | null
  status: string
  method: string
  reason: string | null
  provider_status: string | null
  created_at: string
}

export interface NotificationRecord {
  id: string
  id_number: string
  attempt_id: string | null
  type: string
  channel: string
  message: string
  created_at: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!resp.ok) {
    const detail = await resp.json().catch(() => null)
    const msg =
      (typeof detail?.detail === 'string' && detail.detail) ||
      detail?.detail?.[0]?.msg ||
      `Request failed (HTTP ${resp.status})`
    throw new Error(msg)
  }
  return resp.json() as Promise<T>
}

export function validateId(idNumber: string): Promise<ValidationResponse> {
  return request('/api/v1/validate-id', {
    method: 'POST',
    body: JSON.stringify({ id_number: idNumber }),
  })
}

export function captureSelfie(idNumber: string, image: string): Promise<SelfieResponse> {
  return request('/api/v1/selfies', {
    method: 'POST',
    body: JSON.stringify({ id_number: idNumber, image }),
  })
}

export function checkLiveness(selfieId: string): Promise<LivenessResponse> {
  return request(`/api/v1/selfies/${selfieId}/liveness`, { method: 'POST' })
}

export function verifyIdentity(
  idNumber: string,
  selfieId: string,
): Promise<VerificationDecision> {
  return request('/api/v1/verifications', {
    method: 'POST',
    body: JSON.stringify({ id_number: idNumber, selfie_id: selfieId }),
  })
}

export function getHistory(idNumber: string): Promise<AttemptRecord[]> {
  return request(`/api/v1/verifications/history?id_number=${encodeURIComponent(idNumber)}`)
}

export function getNotifications(idNumber: string): Promise<NotificationRecord[]> {
  return request(`/api/v1/notifications?id_number=${encodeURIComponent(idNumber)}`)
}

export const CHECK_LABELS: Record<string, string> = {
  length_is_13: 'Is 13 digits long',
  is_numeric: 'Contains digits only',
  date_of_birth_plausible: 'Date of birth is plausible',
  citizenship_digit_valid: 'Citizenship digit is valid',
  race_digit_valid: '12th digit is valid',
  luhn_checksum: 'Passes Luhn checksum',
}
