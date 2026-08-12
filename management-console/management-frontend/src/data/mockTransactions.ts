// Dummy data shaped like a SIM-swap order (Backend/sim_swap_service/sim_swap_request.py)
// gated by verification status and fraud decision.

export type VerificationStatus = 'ACCEPTED' | 'REJECTED'
export type FraudDecision = 'APPROVE' | 'REFER' | 'REJECT'
export type TransactionOutcome = 'approved' | 'flagged' | 'pending'

export interface TransactionRecord {
  id: string
  msisdn: string
  identity_reference: string
  verification_status: VerificationStatus
  fraud_decision: FraudDecision
  risk_score: number
  timestamp: string
  outcome: TransactionOutcome
}

export const mockTransactions: TransactionRecord[] = [
  { id: 'ord_88213', msisdn: '+27821234567', identity_reference: 'IDV-83920144', verification_status: 'ACCEPTED', fraud_decision: 'APPROVE', risk_score: 12, timestamp: '2026-08-10T14:02:11Z', outcome: 'approved' },
  { id: 'ord_88207', msisdn: '+27835551122', identity_reference: 'IDV-55810022', verification_status: 'REJECTED', fraud_decision: 'REJECT', risk_score: 91, timestamp: '2026-08-10T11:44:38Z', outcome: 'flagged' },
  { id: 'ord_88198', msisdn: '+27719004433', identity_reference: 'IDV-71002215', verification_status: 'ACCEPTED', fraud_decision: 'REFER', risk_score: 54, timestamp: '2026-08-10T09:15:47Z', outcome: 'pending' },
  { id: 'ord_88177', msisdn: '+27632221190', identity_reference: 'IDV-64221190', verification_status: 'ACCEPTED', fraud_decision: 'APPROVE', risk_score: 8, timestamp: '2026-08-09T18:20:03Z', outcome: 'approved' },
  { id: 'ord_88163', msisdn: '+27719004433', identity_reference: 'IDV-71002215', verification_status: 'REJECTED', fraud_decision: 'REJECT', risk_score: 88, timestamp: '2026-08-09T13:37:19Z', outcome: 'flagged' },
  { id: 'ord_88112', msisdn: '+27823390021', identity_reference: 'IDV-90112233', verification_status: 'ACCEPTED', fraud_decision: 'REFER', risk_score: 61, timestamp: '2026-08-09T09:05:14Z', outcome: 'pending' },
  { id: 'ord_88061', msisdn: '+27786120044', identity_reference: 'IDV-12938475', verification_status: 'ACCEPTED', fraud_decision: 'APPROVE', risk_score: 15, timestamp: '2026-08-08T20:47:02Z', outcome: 'approved' },
  { id: 'ord_88040', msisdn: '+27844471200', identity_reference: 'IDV-33441156', verification_status: 'ACCEPTED', fraud_decision: 'REFER', risk_score: 47, timestamp: '2026-08-08T15:12:39Z', outcome: 'pending' },
  { id: 'ord_88012', msisdn: '+27679012345', identity_reference: 'IDV-20583312', verification_status: 'ACCEPTED', fraud_decision: 'APPROVE', risk_score: 6, timestamp: '2026-08-07T22:31:04Z', outcome: 'approved' },
  { id: 'ord_87991', msisdn: '+27607789123', identity_reference: 'IDV-88231190', verification_status: 'REJECTED', fraud_decision: 'REJECT', risk_score: 95, timestamp: '2026-08-07T12:04:51Z', outcome: 'flagged' },
  { id: 'ord_87970', msisdn: '+27713345566', identity_reference: 'IDV-45509912', verification_status: 'ACCEPTED', fraud_decision: 'APPROVE', risk_score: 19, timestamp: '2026-08-06T17:28:16Z', outcome: 'approved' },
  { id: 'ord_87942', msisdn: '+27825567890', identity_reference: 'IDV-77102834', verification_status: 'ACCEPTED', fraud_decision: 'REFER', risk_score: 52, timestamp: '2026-08-06T08:52:47Z', outcome: 'pending' },
  { id: 'ord_87911', msisdn: '+27825001199', identity_reference: 'IDV-60293841', verification_status: 'ACCEPTED', fraud_decision: 'APPROVE', risk_score: 11, timestamp: '2026-08-05T19:41:22Z', outcome: 'approved' },
  { id: 'ord_87884', msisdn: '+27631178822', identity_reference: 'IDV-38820119', verification_status: 'ACCEPTED', fraud_decision: 'APPROVE', risk_score: 22, timestamp: '2026-08-05T10:03:58Z', outcome: 'approved' },
  { id: 'ord_87850', msisdn: '+27846120933', identity_reference: 'IDV-19583022', verification_status: 'REJECTED', fraud_decision: 'REJECT', risk_score: 84, timestamp: '2026-08-04T21:16:40Z', outcome: 'flagged' },
]

export interface VolumePoint {
  date: string
  approved: number
  flagged: number
  pending: number
}

export const mockVolumeByDay: VolumePoint[] = [
  { date: '2026-07-30', approved: 18, flagged: 2, pending: 3 },
  { date: '2026-07-31', approved: 21, flagged: 1, pending: 4 },
  { date: '2026-08-01', approved: 19, flagged: 3, pending: 2 },
  { date: '2026-08-02', approved: 24, flagged: 2, pending: 5 },
  { date: '2026-08-03', approved: 17, flagged: 4, pending: 3 },
  { date: '2026-08-04', approved: 20, flagged: 3, pending: 2 },
  { date: '2026-08-05', approved: 26, flagged: 1, pending: 4 },
  { date: '2026-08-06', approved: 22, flagged: 2, pending: 3 },
  { date: '2026-08-07', approved: 15, flagged: 4, pending: 2 },
  { date: '2026-08-08', approved: 23, flagged: 2, pending: 3 },
  { date: '2026-08-09', approved: 25, flagged: 2, pending: 2 },
  { date: '2026-08-10', approved: 14, flagged: 1, pending: 1 },
]
