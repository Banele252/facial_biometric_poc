// src/shared/ledger-entry.ts
export type LedgerEntry = {
    id: string;
    timestamp: string;
    label: string;
    kind: 'pass' | 'fail' | 'info';
    detail?: string;
};

export const stamp = (label: string, kind: LedgerEntry['kind'], detail?: string): LedgerEntry => ({
    id: `entry_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    label,
    kind,
    detail
});