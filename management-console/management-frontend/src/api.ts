// API client for the management console backend.
//
// Endpoints:
//   POST /api/v1/chat                                   System Chatbot — Fraud Assistant agent
//   GET  /api/v1/analytics/audit-logs                   process_log rows
//   GET  /api/v1/analytics/fraud-rejections              rejected_requests rows
//   GET  /api/v1/analytics/fraud-rejections/summary      rejection counts by stage/reason
//   GET  /api/v1/analytics/sim-swap-orders               sim_swap_orders rows
//   GET  /api/v1/analytics/sim-swap-orders/status-summary  order counts by status
//   GET  /api/v1/analytics/sim-swap-orders/volume-by-day   order counts per day per status
//   GET  /api/v1/analytics/transactions                  transactions rows
//   GET  /api/v1/analytics/transactions/status-summary    transaction counts by status
//   GET  /api/v1/analytics/transactions/volume-by-day     transaction counts per day per status
//   GET  /api/v1/analytics/transactions/{id}/report       per-transaction PDF activity report
//   POST /api/v1/auth/login                              username/password login

export interface ChatResponse {
  reply: string
}

export interface PaginatedResponse<T> {
  total: number
  limit: number
  offset: number
  items: T[]
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

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export function sendChatMessage(message: string): Promise<ChatResponse> {
  return request('/api/v1/chat', {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}

// --- Audit logs (process_log) -----------------------------------------

export interface AuditLogEntry {
  id: string
  environment: string
  process: string
  payload: Record<string, unknown>
  created_at: string
}

export function getAuditLogs(
  filters: { process?: string; environment?: string; limit?: number; offset?: number } = {},
): Promise<PaginatedResponse<AuditLogEntry>> {
  return request(`/api/v1/analytics/audit-logs${buildQuery(filters)}`)
}

// --- Fraud rejections (rejected_requests) -------------------------------

export interface FraudRejection {
  id: string
  id_number: string
  msisdn: string
  device_id: string
  stage: string
  reason: string
  created_at: string
}

export interface FraudRuleSummaryEntry {
  stage: string
  reason: string
  trigger_count: number
}

export function getFraudRejections(
  filters: { stage?: string; msisdn?: string; limit?: number; offset?: number } = {},
): Promise<PaginatedResponse<FraudRejection>> {
  return request(`/api/v1/analytics/fraud-rejections${buildQuery(filters)}`)
}

export function getFraudRejectionsSummary(): Promise<{ rules: FraudRuleSummaryEntry[] }> {
  return request('/api/v1/analytics/fraud-rejections/summary')
}

// --- SIM-swap orders (transactions) -------------------------------------

export interface SimSwapOrder {
  order_id: string
  msisdn: string
  new_sim_serial: string
  identity_reference: string
  status: string
  created_at: string
}

export interface SimSwapStatusCount {
  status: string
  count: number
}

export interface SimSwapVolumeRow {
  day: string
  status: string
  count: number
}

export function getSimSwapOrders(
  filters: { status?: string; msisdn?: string; limit?: number; offset?: number } = {},
): Promise<PaginatedResponse<SimSwapOrder>> {
  return request(`/api/v1/analytics/sim-swap-orders${buildQuery(filters)}`)
}

export function getSimSwapStatusSummary(): Promise<{ statuses: SimSwapStatusCount[] }> {
  return request('/api/v1/analytics/sim-swap-orders/status-summary')
}

export function getSimSwapVolumeByDay(days = 14): Promise<{ days: SimSwapVolumeRow[] }> {
  return request(`/api/v1/analytics/sim-swap-orders/volume-by-day${buildQuery({ days })}`)
}

// --- Transactions --------------------------------------------------------

export interface Transaction {
  id: string
  msisdn: string
  id_number: string
  sim_serial: string
  transaction_kind: string
  status: string
  reason: string
  created_at: string
}

export interface TransactionStatusCount {
  status: string
  count: number
}

export interface TransactionVolumeRow {
  day: string
  status: string
  count: number
}

export function getTransactions(
  filters: {
    status?: string
    msisdn?: string
    transaction_kind?: string
    limit?: number
    offset?: number
  } = {},
): Promise<PaginatedResponse<Transaction>> {
  return request(`/api/v1/analytics/transactions${buildQuery(filters)}`)
}

export function getTransactionStatusSummary(): Promise<{ statuses: TransactionStatusCount[] }> {
  return request('/api/v1/analytics/transactions/status-summary')
}

export function getTransactionVolumeByDay(days = 14): Promise<{ days: TransactionVolumeRow[] }> {
  return request(`/api/v1/analytics/transactions/volume-by-day${buildQuery({ days })}`)
}

// Binary PDF response - not JSON, so this bypasses the shared request<T>() helper.
export async function downloadTransactionReport(id: string): Promise<Blob> {
  const resp = await fetch(`/api/v1/analytics/transactions/${encodeURIComponent(id)}/report`)
  if (!resp.ok) {
    const detail = await resp.json().catch(() => null)
    const msg =
      (typeof detail?.detail === 'string' && detail.detail) || `Request failed (HTTP ${resp.status})`
    throw new Error(msg)
  }
  return resp.blob()
}

// --- Auth ------------------------------------------------------------------

export interface User {
  id: number
  username: string
  name: string
  email: string
}

export function login(username: string, password: string): Promise<User> {
  return request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}
