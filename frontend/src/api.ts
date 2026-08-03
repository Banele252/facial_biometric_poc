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

/** "review" comes from the face match provider's "In Review" verdict — the
 *  journey is neither approved nor rejected and needs a human to finish it. */
export type DecisionStatus = 'approved' | 'rejected' | 'review'

/** One step of the journey, in the order the backend ran it. */
export interface CheckResult {
  name: string
  label: string
  status: 'pass' | 'fail' | 'review' | 'skipped'
  detail: string
  score: number | null
}

export interface VerificationDecision {
  attempt_id: string
  id_number: string
  status: DecisionStatus
  method: string
  reason: string
  provider_status: string | null
  notification_type: string
  /** Face match confidence, 0-100. Null when no match ran (e.g. a passport). */
  match_score: number | null
  /** "sandbox" or "production" — which VerifyNow mode produced this decision. */
  mode: string | null
  document_type: DocumentKind
  /** Issued only once every check has passed. Null on any other outcome. */
  authorisation_token: string | null
  checks: CheckResult[]
}

export interface VerificationInput {
  id_number: string
  selfie_id: string
  /** Required — the journey refuses to start without it (RICA/POPIA). */
  consent: boolean
  document_type: DocumentKind
  /** Base64 data URL of the scanned ID or passport. Required. */
  document_image: string
  full_name?: string
  msisdn?: string
  new_sim_number?: string
  device_id?: string
  imei?: string
  transaction?: TransactionKind
  target_network?: string
}

/** The two high-risk transactions the CARB names. They share the whole
 *  identity chain and differ only in what happens once it passes. */
export type TransactionKind = 'sim_swap' | 'number_port'

/** Which document the customer is presenting. A passport skips the SA ID
 *  checksum and the Home Affairs face match — Home Affairs holds no photo for
 *  a passport holder, so their identity rests on the document checks and RICA. */
export type DocumentKind = 'SA_ID' | 'PASSPORT'

/**
 * A stable per-browser identifier for the fraud engine's repeat-device and
 * velocity checks. Deliberately random and local-only — it identifies the
 * device across attempts, not the person, and never leaves as anything but an
 * opaque string.
 */
export function getDeviceId(): string {
  const key = 'mtn.deviceId'
  try {
    const existing = localStorage.getItem(key)
    if (existing) return existing
    const id = `web-${crypto.randomUUID()}`
    localStorage.setItem(key, id)
    return id
  } catch {
    // Private browsing or storage disabled: the checks still run, they just
    // see each attempt as a new device.
    return 'web-unavailable'
  }
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

/**
 * Runs the whole journey server-side, in the order the process diagram sets
 * out: consent, ID precheck, liveness, fraud pre-checks, the three document
 * checks, RICA, Home Affairs, then the authorisation token and the swap.
 *
 * Takes ~12s in sandbox, because the provider rate-limits per IP and the
 * backend waits between its calls — callers must show a progress state rather
 * than assuming this is quick.
 */
export function verifyIdentity(input: VerificationInput): Promise<VerificationDecision> {
  return request('/api/v1/verifications', {
    method: 'POST',
    body: JSON.stringify(input),
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
