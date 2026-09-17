// src/types/audit.ts
//
// This file is the console's copy of the wire contract emitted by the
// mobile app's src/services/audit/AuditService.ts. Any change to
// AuditLogEntry or AuditEvent there must be mirrored here.
//
// Field names are snake_case because they are the backend's, not remapped
// on the way in — see lib/auditAdapter.ts for the view-model mapping.

export type AuditEvent =
    | 'JOURNEY_STARTED'
    | 'SCREEN_VIEWED'
    | 'CONSENT_GRANTED'
    | 'CONSENT_DECLINED'
    | 'CONSENT_WITHDRAWN'
    | 'ID_VALIDATION_INITIATED'
    | 'ID_VALIDATION_PASSED'
    | 'ID_VALIDATION_FAILED'
    | 'ID_SCAN_INITIATED'
    | 'ID_SCAN_COMPLETED'
    | 'OCR_EXTRACTED'
    | 'LIVENESS_INITIATED'
    | 'LIVENESS_CHALLENGE_ISSUED'
    | 'LIVENESS_PASSED'
    | 'LIVENESS_FAILED'
    | 'FACIAL_MATCH_INITIATED'
    | 'FACIAL_MATCH_PASSED'
    | 'FACIAL_MATCH_FAILED'
    | 'FRAUD_CHECK_INITIATED'
    | 'FRAUD_RULE_TRIGGERED'
    | 'FRAUD_DECISION'
    | 'SWAP_REQUESTED'
    | 'SWAP_PENDING'
    | 'SWAP_APPROVED'
    | 'SWAP_REJECTED'
    | 'SWAP_COMPLETED'
    | 'BARCODE_SCANNED'
    | 'ICCID_CAPTURED'
    | 'SAID_SELECTED'
    | 'JOURNEY_ENDED'
    | 'DATA_PURGE_SCHEDULED'
    | 'RICA_RECORD_STORED'
    | 'IDENTITY_VERIFICATION_COMPLETED'
    | 'IDENTITY_VERIFICATION_FAILED'
    | 'SAID_CAPTURE_FAILED'
    | 'ICCID_CAPTURE_FAILED'
    | 'ERROR_OCCURRED'
    | 'SIM_SWAP_JOURNEY_COMPLETED';

export type AuditOutcome = 'success' | 'failure' | 'blocked' | 'pending';

export interface AuditLogEntry {
    event_id: string;
    event_type: AuditEvent;
    /** ISO-8601, set client-side on the device. */
    timestamp: string;
    session_id: string;
    user_id?: string;
    msisdn?: string;
    device_id: string;
    app_version: string;
    os_version: string;
    screen?: string;
    action?: string;
    outcome?: AuditOutcome;
    reason?: string;
    metadata?: Record<string, unknown>;
    integrity_hash: string;
    /** Absent on the first entry of a hash chain segment. */
    previous_hash?: string;
    source: 'mobile';

    // ---- server-side additions ----
    // Not written by the device. Present only if the backend stamps them
    // at ingest. Treated as optional everywhere in the UI.
    environment?: 'prod' | 'staging' | 'dev';
    /** Server receive time — trustworthy, unlike the device timestamp. */
    received_at?: string;
    batch_hash?: string;
}

export interface AuditLogPage {
    entries: AuditLogEntry[];
    /** Opaque cursor for the next page; absent on the last page. */
    next_cursor?: string | null;
    total?: number;
}

export interface AuditLogQuery {
    sessionId?: string;
    msisdn?: string;
    eventType?: AuditEvent;
    outcome?: AuditOutcome;
    environment?: string;
    since?: string;
    until?: string;
    limit?: number;
    cursor?: string;
}
