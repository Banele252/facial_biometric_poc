// src/hooks/useLiveEvents.ts
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { connectEventStream } from '@/lib/eventStream';

/** Which query keys each server event invalidates. */
const INVALIDATES: Record<string, string[]> = {
    'audit.batch': ['audit-logs', 'fraud-intelligence', 'transactions'],
    'fraud.decision': ['fraud-intelligence', 'audit-logs'],
    'simswap.status': ['transactions', 'audit-logs'],
};

export type LiveStatus = 'connecting' | 'live' | 'reconnecting';

/**
 * Subscribes to the server event stream and refetches affected queries.
 *
 * The event carries a summary, not the rows: invalidation makes React Query
 * refetch through the normal authenticated, scope-checked endpoint, so
 * there is one read path for audit data rather than two that can disagree.
 * Polling stays on as a slow backstop for anything the stream misses.
 */
export function useLiveEvents(): LiveStatus {
    const queryClient = useQueryClient();
    const [status, setStatus] = useState<LiveStatus>('connecting');

    useEffect(() => {
        const controller = new AbortController();

        void connectEventStream({
            signal: controller.signal,
            onStatusChange: (connected) =>
                setStatus(connected ? 'live' : 'reconnecting'),
            onEvent: (event) => {
                const keys = INVALIDATES[event.type];
                if (!keys) return;

                for (const key of keys) {
                    void queryClient.invalidateQueries({ queryKey: [key] });
                }
            },
        });

        return () => controller.abort();
    }, [queryClient]);

    return status;
}
