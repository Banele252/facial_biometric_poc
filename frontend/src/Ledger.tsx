import type { LedgerEntry } from './ledger-entry'

/**
 * The verification ledger.
 *
 * Every stage of the journey stamps a timestamped record here, carrying the
 * identifiers the API actually returns — selfie id, liveness score and
 * provider, attempt id, provider status. The CARB classifies this flow as
 * processing sensitive personal information (slide 20) and requires an audit
 * trail; showing that trail to the customer, rather than burying it, is the
 * point. Nothing here is decorative: every line is a real API result.
 */
interface Props {
  entries: LedgerEntry[]
  /** What this journey will record, listed while the ledger is still empty. */
  pending: string[]
}

export default function Ledger({ entries, pending }: Props) {
  const empty = entries.length === 0

  return (
    <aside className="ledger" aria-label="Verification ledger">
      <div className="ledger-head">
        <span>Verification ledger</span>
        <span className="ledger-count">{entries.length.toString().padStart(2, '0')}</span>
      </div>

      {empty && (
        <p className="ledger-empty">
          Nothing recorded yet. This is what will be kept:
        </p>
      )}

      <ol className="ledger-list" aria-live="polite">
        {entries.map((e) => (
          <li key={e.id} className={`ledger-entry is-${e.kind}`}>
            <span className="ledger-time">{e.time}</span>
            <span className="ledger-label">{e.label}</span>
            {e.detail && <span className="ledger-detail">{e.detail}</span>}
          </li>
        ))}

        {empty &&
          pending.map((label) => (
            <li key={label} className="ledger-entry is-pending">
              <span className="ledger-time">--:--:--</span>
              <span className="ledger-label">{label}</span>
            </li>
          ))}
      </ol>

      <p className="ledger-foot">Retained per MTN data policy</p>
    </aside>
  )
}
