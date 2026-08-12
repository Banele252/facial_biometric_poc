// Dummy data shaped like Backend/app/services/audit.py's process_log rows
// (id, environment, process, payload, created_at). The real management-backend
// will eventually expose this via an endpoint reading the same table.

export type AuditEnvironment = 'dev' | 'staging' | 'prod'

export type AuditProcess =
  | 'identity_validation'
  | 'liveness_check'
  | 'fraud_check'
  | 'sim_swap_requested'
  | 'sim_swap_authorised'
  | 'sim_swap_rejected'

export interface AuditLogEntry {
  id: string
  environment: AuditEnvironment
  process: AuditProcess
  payload: Record<string, unknown>
  created_at: string
}

export const mockAuditLogs: AuditLogEntry[] = [
  { id: 'evt_9f21a3', environment: 'prod', process: 'sim_swap_authorised', payload: { msisdn: '+27821234567', order_id: 'ord_88213' }, created_at: '2026-08-10T14:02:11Z' },
  { id: 'evt_9f219f', environment: 'prod', process: 'fraud_check', payload: { decision: 'APPROVE', risk_score: 12 }, created_at: '2026-08-10T14:01:52Z' },
  { id: 'evt_9f2178', environment: 'prod', process: 'liveness_check', payload: { result: 'passed', confidence: 0.98 }, created_at: '2026-08-10T14:01:30Z' },
  { id: 'evt_9f2140', environment: 'prod', process: 'identity_validation', payload: { identity_reference: 'IDV-83920144', status: 'matched' }, created_at: '2026-08-10T14:01:05Z' },
  { id: 'evt_9f1e02', environment: 'prod', process: 'sim_swap_rejected', payload: { msisdn: '+27835551122', reason: 'watchlist_hit' }, created_at: '2026-08-10T11:44:38Z' },
  { id: 'evt_9f1dfa', environment: 'prod', process: 'fraud_check', payload: { decision: 'REJECT', risk_score: 91 }, created_at: '2026-08-10T11:44:20Z' },
  { id: 'evt_9f1c31', environment: 'staging', process: 'sim_swap_requested', payload: { msisdn: '+27719004433', order_id: 'ord_88198' }, created_at: '2026-08-10T09:15:47Z' },
  { id: 'evt_9f18b7', environment: 'prod', process: 'sim_swap_authorised', payload: { msisdn: '+27632221190', order_id: 'ord_88177' }, created_at: '2026-08-09T18:20:03Z' },
  { id: 'evt_9f18a2', environment: 'prod', process: 'fraud_check', payload: { decision: 'APPROVE', risk_score: 8 }, created_at: '2026-08-09T18:19:41Z' },
  { id: 'evt_9f1751', environment: 'prod', process: 'liveness_check', payload: { result: 'passed', confidence: 0.94 }, created_at: '2026-08-09T18:19:12Z' },
  { id: 'evt_9f1699', environment: 'dev', process: 'identity_validation', payload: { identity_reference: 'IDV-71002215', status: 'no_match' }, created_at: '2026-08-09T16:02:57Z' },
  { id: 'evt_9f1522', environment: 'prod', process: 'sim_swap_rejected', payload: { msisdn: '+27844471200', reason: 'device_risk_high' }, created_at: '2026-08-09T13:37:19Z' },
  { id: 'evt_9f1509', environment: 'prod', process: 'fraud_check', payload: { decision: 'REFER', risk_score: 58 }, created_at: '2026-08-09T13:36:58Z' },
  { id: 'evt_9f10e4', environment: 'prod', process: 'sim_swap_requested', payload: { msisdn: '+27823390021', order_id: 'ord_88112' }, created_at: '2026-08-09T09:05:14Z' },
  { id: 'evt_9f0a77', environment: 'prod', process: 'sim_swap_authorised', payload: { msisdn: '+27786120044', order_id: 'ord_88061' }, created_at: '2026-08-08T20:47:02Z' },
]
