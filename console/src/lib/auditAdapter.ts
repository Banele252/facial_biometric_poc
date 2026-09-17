// src/lib/auditAdapter.ts
//
// Maps the mobile wire contract onto what the audit table renders, and
// verifies the tamper-evident hash chain the device builds.

import type {
    AuditLogEntry,
    AuditEvent,
    AuditOutcome,
} from '@/types/audit';

export type ChainStatus =
    | 'ok'          // previous_hash matches the preceding entry
    | 'start'       // first entry of a chain segment (no previous_hash)
    | 'broken'      // previous_hash does not match the preceding entry
    | 'orphan';     // claims a predecessor that is not in the loaded window

export interface AuditRow {
    id: string;
    /** Device clock. */
    timestamp: string;
    /** Server receive time, when the backend stamps it. */
    receivedAt?: string;
    eventType: AuditEvent;
    /** Human label for the event, e.g. "Liveness passed". */
    process: string;
    screen?: string;
    outcome?: AuditOutcome;
    sessionId: string;
    deviceId: string;
    msisdn?: string;
    environment?: string;
    reason?: string;
    /** Everything not surfaced as its own column, for the detail cell. */
    payload: Record<string, unknown>;
    integrityHash: string;
    previousHash?: string;
    chain: ChainStatus;
}

/** SCREEN_VIEWED -> "Screen viewed" */
export function humaniseEvent(event: string): string {
    const lower = event.toLowerCase().replace(/_/g, ' ');
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Truncate a hash for display: 9f3a1c…7b20 */
export function shortHash(hash?: string): string {
    if (!hash) return '—';
    return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

export function formatTimestamp(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString('en-ZA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });
}

/**
 * Verify hash-chain linkage across a page of entries.
 *
 * Only linkage is checked, not the integrity_hash itself. Recomputing
 * integrity_hash would require byte-identical reconstruction of the JSON
 * the device hashed (exact key order, exact undefined-vs-absent handling),
 * which is fragile across platforms. Server-side recomputation at ingest
 * is the right place for that; the console reports what the chain claims.
 *
 * Note the device resets its chain to the zero hash after every successful
 * flush, so the first entry of each batch legitimately has no predecessor
 * and is reported as 'start', not 'broken'.
 */
export function verifyChain(entries: AuditLogEntry[]): ChainStatus[] {
    const hashes = new Set(entries.map((entry) => entry.integrity_hash));

    return entries.map((entry, index) => {
        if (!entry.previous_hash) return 'start';

        const preceding = entries[index - 1];
        if (preceding && preceding.integrity_hash === entry.previous_hash) {
            return 'ok';
        }

        // The predecessor exists but is not adjacent — usually just paging
        // or sort order, not tampering.
        if (hashes.has(entry.previous_hash)) return 'ok';

        return preceding ? 'broken' : 'orphan';
    });
}

/** Fields promoted to their own column, excluded from the payload cell. */
const PROMOTED_KEYS = new Set([
    'event_id',
    'event_type',
    'timestamp',
    'received_at',
    'session_id',
    'device_id',
    'msisdn',
    'screen',
    'outcome',
    'reason',
    'environment',
    'integrity_hash',
    'previous_hash',
    'batch_hash',
    'source',
    'metadata',
]);

export function toRows(entries: AuditLogEntry[]): AuditRow[] {
    const chain = verifyChain(entries);

    return entries.map((entry, index) => {
        const rest: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(entry)) {
            if (!PROMOTED_KEYS.has(key) && value !== undefined) {
                rest[key] = value;
            }
        }

        return {
            id: entry.event_id,
            timestamp: entry.timestamp,
            receivedAt: entry.received_at,
            eventType: entry.event_type,
            process: humaniseEvent(entry.event_type),
            screen: entry.screen,
            outcome: entry.outcome,
            sessionId: entry.session_id,
            deviceId: entry.device_id,
            msisdn: entry.msisdn,
            environment: entry.environment,
            reason: entry.reason,
            payload: { ...(entry.metadata ?? {}), ...rest },
            integrityHash: entry.integrity_hash,
            previousHash: entry.previous_hash,
            chain: chain[index],
        };
    });
}

/** MSISDN masking for a screen anyone in the ops room can see. */
export function maskMsisdn(msisdn?: string): string {
    if (!msisdn) return '—';
    if (msisdn.length <= 6) return msisdn;
    return `${msisdn.slice(0, 6)}••••${msisdn.slice(-2)}`;
}
