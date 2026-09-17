// src/hooks/useFraudStats.ts
import { useQuery } from '@tanstack/react-query';
import { managementGet } from '@/lib/http';
import { env } from '@/lib/env';
import type { FraudSummary } from '@/types/console';

/** Wire shape from the backend (snake_case), mapped to the view model below. */
interface FraudSummaryWire {
    approved: number;
    review: number;
    rejected: number;
    risk_trend: { date: string; score: number }[];
    identities: {
        identity_ref: string;
        msisdn: string;
        outcome: FraudSummary['identities'][number]['outcome'];
        decision: FraudSummary['identities'][number]['decision'];
        risk_score: number;
        reasons?: string[] | string | null;
        timestamp: string;
    }[];
}

function normaliseReasons(reasons?: string[] | string | null): string {
    if (!reasons) return '—';
    return Array.isArray(reasons) ? reasons.join(', ') || '—' : reasons;
}

export function useFraudStats() {
    return useQuery<FraudSummary>({
        queryKey: ['fraud-intelligence'],
        queryFn: async () => {
            const data =
                await managementGet<FraudSummaryWire>('/fraud-intelligence');

            return {
                approved: data.approved,
                review: data.review,
                rejected: data.rejected,
                riskTrend: data.risk_trend ?? [],
                identities: (data.identities ?? []).map((row) => ({
                    identityRef: row.identity_ref,
                    msisdn: row.msisdn,
                    outcome: row.outcome,
                    decision: row.decision,
                    riskScore: row.risk_score,
                    reasons: normaliseReasons(row.reasons),
                    timestamp: row.timestamp,
                })),
            };
        },
        refetchInterval: env.pollIntervalMs,
        retry: 1,
    });
}
