// src/hooks/useTransactions.ts
import { useQuery } from '@tanstack/react-query';
import { managementGet } from '@/lib/http';
import { env } from '@/lib/env';
import type { TransactionSummary } from '@/types/console';

interface TransactionSummaryWire {
    total: number;
    approved: number;
    flagged: number;
    volume: {
        date: string;
        approved: number;
        flagged: number;
        pending: number;
    }[];
    orders: {
        order_id: string;
        msisdn: string;
        identity_ref: string;
        verification: TransactionSummary['orders'][number]['verification'];
        fraud_decision: TransactionSummary['orders'][number]['fraudDecision'];
        risk_score: number;
        timestamp: string;
        outcome: TransactionSummary['orders'][number]['outcome'];
    }[];
}

export function useTransactions() {
    return useQuery<TransactionSummary>({
        queryKey: ['transactions'],
        queryFn: async () => {
            const data =
                await managementGet<TransactionSummaryWire>('/transactions');

            return {
                total: data.total,
                approved: data.approved,
                flagged: data.flagged,
                volume: data.volume ?? [],
                orders: (data.orders ?? []).map((row) => ({
                    id: row.order_id,
                    msisdn: row.msisdn,
                    identityRef: row.identity_ref,
                    verification: row.verification,
                    fraudDecision: row.fraud_decision,
                    riskScore: row.risk_score,
                    timestamp: row.timestamp,
                    outcome: row.outcome,
                })),
            };
        },
        refetchInterval: env.pollIntervalMs,
        retry: 1,
    });
}
