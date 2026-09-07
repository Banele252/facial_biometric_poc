// src/hooks/useAuditLogs.ts
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { managementGet } from '@/lib/http';
import { env } from '@/lib/env';
import { toRows, type AuditRow } from '@/lib/auditAdapter';
import type { AuditLogPage, AuditLogQuery } from '@/types/audit';

export interface UseAuditLogsResult {
    rows: AuditRow[];
    total?: number;
    nextCursor?: string | null;
}

/**
 * Reads the audit trail written by the mobile app.
 *
 * The device POSTs batches to /audit/batch; this is the read side of the
 * same store. Query params go out as snake_case because the backend owns
 * the filter contract.
 */
export function useAuditLogs(query: AuditLogQuery = {}) {
    return useQuery<UseAuditLogsResult>({
        queryKey: ['audit-logs', query],
        queryFn: async () => {
            const page = await managementGet<AuditLogPage>('/audit-logs', {
                session_id: query.sessionId,
                msisdn: query.msisdn,
                event_type: query.eventType,
                outcome: query.outcome,
                environment: query.environment,
                since: query.since,
                until: query.until,
                limit: query.limit ?? 200,
                cursor: query.cursor,
            });

            // Tolerate a bare array if the backend does not paginate yet.
            const entries = Array.isArray(page) ? page : page.entries ?? [];

            return {
                rows: toRows(entries),
                total: Array.isArray(page) ? entries.length : page.total,
                nextCursor: Array.isArray(page) ? null : page.next_cursor,
            };
        },
        refetchInterval: env.pollIntervalMs,
        placeholderData: keepPreviousData,
        retry: 1,
    });
}
