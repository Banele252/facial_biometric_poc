/**
 * Ledger record shape and constructor.
 *
 * Kept separate from the component so the module exports only data helpers —
 * mixing them with a component breaks React Fast Refresh.
 */

export type LedgerKind = 'pass' | 'fail' | 'info'

export interface LedgerEntry {
  id: string
  time: string
  label: string
  detail?: string
  kind: LedgerKind
}

export function stamp(label: string, kind: LedgerKind, detail?: string): LedgerEntry {
  const now = new Date()
  return {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    time: now.toLocaleTimeString('en-ZA', { hour12: false }),
    label,
    detail,
    kind,
  }
}
