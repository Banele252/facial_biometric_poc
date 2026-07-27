import { useState, type FormEvent } from 'react'
import { CHECK_LABELS, validateId, type ValidationResponse } from './api'

export default function App() {
  const [idNumber, setIdNumber] = useState('')
  const [result, setResult] = useState<ValidationResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      setResult(await validateId(idNumber.trim()))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main>
      <header>
        <h1>Identity Verification</h1>
        <p className="subtitle">
          Structural validation of a South African ID number. No data is stored.
        </p>
      </header>

      <form onSubmit={onSubmit}>
        <label htmlFor="id-number">ID number</label>
        <input
          id="id-number"
          name="id-number"
          inputMode="numeric"
          autoComplete="off"
          placeholder="13 digits"
          maxLength={13}
          value={idNumber}
          onChange={(e) => setIdNumber(e.target.value)}
        />
        <button type="submit" disabled={loading || idNumber.trim().length === 0}>
          {loading ? 'Checking…' : 'Validate'}
        </button>
      </form>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {result && (
        <section className="result" aria-live="polite">
          <p className={result.valid ? 'verdict pass' : 'verdict fail'}>
            {result.valid ? 'All checks passed' : `${result.failed_checks.length} check(s) failed`}
          </p>
          <ul>
            {Object.entries(result.checks).map(([name, passed]) => (
              <li key={name} className={passed ? 'pass' : 'fail'}>
                <span aria-hidden="true">{passed ? '✓' : '✗'}</span>
                <span>{CHECK_LABELS[name] ?? name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
