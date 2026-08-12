// Dummy data shaped like the FraudOutcome dataclass in
// Backend/app/services/fraud.py (outcome, decision, risk_score, reasons, detail).

export type FraudOutcomeType = 'approved' | 'review' | 'rejected'

export interface FraudRecord {
  id: string
  identity_reference: string
  msisdn: string
  outcome: FraudOutcomeType
  decision: 'APPROVE' | 'REFER' | 'REJECT'
  risk_score: number
  reasons: string[]
  detail: string
  created_at: string
}

export const mockFraudOutcomes: FraudRecord[] = [
  { id: 'frd_1001', identity_reference: 'IDV-83920144', msisdn: '+27821234567', outcome: 'approved', decision: 'APPROVE', risk_score: 12, reasons: [], detail: 'No fraud indicators (risk score 12)', created_at: '2026-08-10T14:01:52Z' },
  { id: 'frd_1000', identity_reference: 'IDV-55810022', msisdn: '+27835551122', outcome: 'rejected', decision: 'REJECT', risk_score: 91, reasons: ['watchlist_hit'], detail: 'Identity reference matched fraud watchlist', created_at: '2026-08-10T11:44:20Z' },
  { id: 'frd_0999', identity_reference: 'IDV-71002215', msisdn: '+27719004433', outcome: 'review', decision: 'REFER', risk_score: 54, reasons: ['device_repeat_use'], detail: 'Risk score 54 — referred for review', created_at: '2026-08-10T09:15:47Z' },
  { id: 'frd_0998', identity_reference: 'IDV-64221190', msisdn: '+27632221190', outcome: 'approved', decision: 'APPROVE', risk_score: 8, reasons: [], detail: 'No fraud indicators (risk score 8)', created_at: '2026-08-09T18:19:41Z' },
  { id: 'frd_0997', identity_reference: 'IDV-71002215', msisdn: '+27719004433', outcome: 'rejected', decision: 'REJECT', risk_score: 88, reasons: ['device_risk_high', 'velocity_exceeded'], detail: 'Device risk high combined with velocity breach', created_at: '2026-08-09T13:36:58Z' },
  { id: 'frd_0996', identity_reference: 'IDV-90112233', msisdn: '+27823390021', outcome: 'review', decision: 'REFER', risk_score: 61, reasons: ['new_device'], detail: 'Risk score 61 — referred for review', created_at: '2026-08-09T09:05:14Z' },
  { id: 'frd_0995', identity_reference: 'IDV-12938475', msisdn: '+27786120044', outcome: 'approved', decision: 'APPROVE', risk_score: 15, reasons: [], detail: 'No fraud indicators (risk score 15)', created_at: '2026-08-08T20:47:02Z' },
  { id: 'frd_0994', identity_reference: 'IDV-33441156', msisdn: '+27844471200', outcome: 'review', decision: 'REFER', risk_score: 47, reasons: ['velocity_exceeded'], detail: 'Risk score 47 — referred for review', created_at: '2026-08-08T15:12:39Z' },
  { id: 'frd_0993', identity_reference: 'IDV-20583312', msisdn: '+27679012345', outcome: 'approved', decision: 'APPROVE', risk_score: 6, reasons: [], detail: 'No fraud indicators (risk score 6)', created_at: '2026-08-07T22:31:04Z' },
  { id: 'frd_0992', identity_reference: 'IDV-88231190', msisdn: '+27607789123', outcome: 'rejected', decision: 'REJECT', risk_score: 95, reasons: ['watchlist_hit'], detail: 'Identity reference matched fraud watchlist', created_at: '2026-08-07T12:04:51Z' },
  { id: 'frd_0991', identity_reference: 'IDV-45509912', msisdn: '+27713345566', outcome: 'approved', decision: 'APPROVE', risk_score: 19, reasons: [], detail: 'No fraud indicators (risk score 19)', created_at: '2026-08-06T17:28:16Z' },
  { id: 'frd_0990', identity_reference: 'IDV-77102834', msisdn: '+27825567890', outcome: 'review', decision: 'REFER', risk_score: 52, reasons: ['new_device', 'device_repeat_use'], detail: 'Risk score 52 — referred for review', created_at: '2026-08-06T08:52:47Z' },
]

export interface RiskTrendPoint {
  date: string
  avg_risk_score: number
}

export const mockRiskTrend: RiskTrendPoint[] = [
  { date: '2026-07-28', avg_risk_score: 22 },
  { date: '2026-07-29', avg_risk_score: 26 },
  { date: '2026-07-30', avg_risk_score: 31 },
  { date: '2026-07-31', avg_risk_score: 28 },
  { date: '2026-08-01', avg_risk_score: 35 },
  { date: '2026-08-02', avg_risk_score: 41 },
  { date: '2026-08-03', avg_risk_score: 38 },
  { date: '2026-08-04', avg_risk_score: 45 },
  { date: '2026-08-05', avg_risk_score: 52 },
  { date: '2026-08-06', avg_risk_score: 49 },
  { date: '2026-08-07', avg_risk_score: 58 },
  { date: '2026-08-08', avg_risk_score: 44 },
  { date: '2026-08-09', avg_risk_score: 39 },
  { date: '2026-08-10', avg_risk_score: 33 },
]
