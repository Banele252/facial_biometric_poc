export type Environment = 'prod' | 'staging' | 'dev';

export type Outcome = 'approved' | 'rejected' | 'review' | 'pending' | 'flagged';

export type VerificationStatus = 'ACCEPTED' | 'REJECTED';

export type FraudDecision = 'APPROVE' | 'REJECT' | 'REFER';

// The audit contract now lives in types/audit.ts, mirroring the shape the
// mobile AuditService actually emits. Re-exported for convenience.
export type { AuditLogEntry, AuditEvent, AuditOutcome } from './audit';

export interface FraudIdentity {
  identityRef: string;
  msisdn: string;
  outcome: Outcome;
  decision: FraudDecision;
  riskScore: number;
  reasons: string;
  timestamp: string;
}

export interface FraudSummary {
  approved: number;
  review: number;
  rejected: number;
  riskTrend: { date: string; score: number }[];
  identities: FraudIdentity[];
}

export interface TransactionVolume {
  date: string;
  approved: number;
  flagged: number;
  pending: number;
}

export interface Transaction {
  id: string;
  msisdn: string;
  identityRef: string;
  verification: VerificationStatus;
  fraudDecision: FraudDecision;
  riskScore: number;
  timestamp: string;
  outcome: Outcome;
}

export interface TransactionSummary {
  total: number;
  approved: number;
  flagged: number;
  volume: TransactionVolume[];
  orders: Transaction[];
}

export interface ChatMessage {
  id: string;
  from: 'bot' | 'user';
  text: string;
  timestamp: string;
}
