import { useState, type FormEvent } from 'react'
import SelfieCapture from './SelfieCapture'
import {
  CHECK_LABELS,
  captureSelfie,
  checkLiveness,
  getHistory,
  getNotifications,
  validateId,
  verifyIdentity,
  type AttemptRecord,
  type LivenessResponse,
  type NotificationRecord,
  type ValidationResponse,
  type VerificationDecision,
} from './api'

type Step = 'id' | 'selfie' | 'verify' | 'done'

const STEP_LABELS: Record<Step, string> = {
  id: 'ID number',
  selfie: 'Selfie & liveness',
  verify: 'Verification',
  done: 'Result',
}

export default function App() {
  const [step, setStep] = useState<Step>('id')
  const [idNumber, setIdNumber] = useState('')
  const [validation, setValidation] = useState<ValidationResponse | null>(null)
  const [selfieId, setSelfieId] = useState<string | null>(null)
  const [liveness, setLiveness] = useState<LivenessResponse | null>(null)
  const [decision, setDecision] = useState<VerificationDecision | null>(null)
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const [history, setHistory] = useState<AttemptRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function reset() {
    setStep('id')
    setValidation(null)
    setSelfieId(null)
    setLiveness(null)
    setDecision(null)
    setNotifications([])
    setHistory([])
    setError(null)
  }

  async function onValidate(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const result = await validateId(idNumber.trim())
      setValidation(result)
      if (result.valid) setStep('selfie')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function onCapture(dataUrl: string) {
    setLoading(true)
    setError(null)
    setLiveness(null)
    try {
      const selfie = await captureSelfie(idNumber.trim(), dataUrl)
      setSelfieId(selfie.selfie_id)
      const live = await checkLiveness(selfie.selfie_id)
      setLiveness(live)
      if (live.is_live) setStep('verify')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Selfie capture failed')
    } finally {
      setLoading(false)
    }
  }

  async function onVerify() {
    if (!selfieId) return
    setLoading(true)
    setError(null)
    try {
      const result = await verifyIdentity(idNumber.trim(), selfieId)
      setDecision(result)
      const id = idNumber.trim()
      setNotifications(await getNotifications(id))
      setHistory(await getHistory(id))
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main>
      <header>
        <h1>Identity Verification</h1>
        <p className="subtitle">
          SA ID validation, selfie liveness, and identity verification for subscription
          fraud prevention.
        </p>
      </header>

      <ol className="steps">
        {(Object.keys(STEP_LABELS) as Step[]).map((s) => (
          <li key={s} className={s === step ? 'current' : ''}>
            {STEP_LABELS[s]}
          </li>
        ))}
      </ol>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {step === 'id' && (
        <form onSubmit={onValidate}>
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
            {loading ? 'Checking…' : 'Validate ID'}
          </button>
          {validation && !validation.valid && (
            <ul className="checks">
              {Object.entries(validation.checks).map(([name, passed]) => (
                <li key={name} className={passed ? 'pass' : 'fail'}>
                  <span aria-hidden="true">{passed ? '✓' : '✗'}</span>
                  <span>{CHECK_LABELS[name] ?? name}</span>
                </li>
              ))}
            </ul>
          )}
        </form>
      )}

      {step === 'selfie' && (
        <section>
          <p className="verdict pass">ID structurally valid — capture a selfie.</p>
          <SelfieCapture onCapture={onCapture} disabled={loading} />
          {loading && <p className="muted">Checking liveness…</p>}
          {liveness && !liveness.is_live && (
            <p className="error">
              Liveness failed (score {liveness.score}). {liveness.detail} Please retry.
            </p>
          )}
        </section>
      )}

      {step === 'verify' && (
        <section>
          <p className="verdict pass">
            Liveness passed (score {liveness?.score}, {liveness?.provider}).
          </p>
          <button type="button" onClick={onVerify} disabled={loading}>
            {loading ? 'Verifying…' : 'Complete verification'}
          </button>
        </section>
      )}

      {step === 'done' && decision && (
        <section className="result" aria-live="polite">
          <p className={decision.status === 'approved' ? 'verdict pass' : 'verdict fail'}>
            {decision.status === 'approved' ? 'Approved' : 'Rejected'}
            {decision.method === 'fallback' && ' (fallback review)'}
          </p>
          <p className="muted">{decision.reason}</p>

          {notifications.length > 0 && (
            <>
              <h2>Notifications</h2>
              <ul className="feed">
                {notifications.map((n) => (
                  <li key={n.id} className={n.type === 'approval' ? 'pass' : 'fail'}>
                    <strong>{n.type}</strong> — {n.message}
                  </li>
                ))}
              </ul>
            </>
          )}

          {history.length > 0 && (
            <>
              <h2>Verification history</h2>
              <ul className="feed">
                {history.map((h) => (
                  <li key={h.id} className={h.status === 'approved' ? 'pass' : 'fail'}>
                    <strong>{h.status}</strong> via {h.method}
                    {h.reason ? ` — ${h.reason}` : ''}
                  </li>
                ))}
              </ul>
            </>
          )}

          <button type="button" onClick={reset}>
            Start over
          </button>
        </section>
      )}
    </main>
  )
}
