import { useState, type FormEvent } from 'react'
import CameraCapture from './CameraCapture'
import Ledger from './Ledger'
import { stamp, type LedgerEntry } from './ledger-entry'
import {
  CHECK_LABELS,
  captureSelfie,
  checkLiveness,
  getDeviceId,
  getHistory,
  getNotifications,
  validateId,
  verifyIdentity,
  type AttemptRecord,
  type DecisionStatus,
  type DocumentKind,
  type LivenessResponse,
  type NotificationRecord,
  type TransactionKind,
  type ValidationResponse,
  type VerificationDecision,
} from './api'

type Step = 'start' | 'id' | 'document' | 'face' | 'confirm' | 'done'

/* The journey is an ordered sequence — each stage gates the next — so the
 * numbering carries real information rather than decorating the layout. */
const STEPS: { key: Step; label: string }[] = [
  { key: 'start', label: 'Start' },
  { key: 'id', label: 'Details' },
  { key: 'document', label: 'ID scan' },
  { key: 'face', label: 'Face scan' },
  { key: 'confirm', label: 'Confirm' },
  { key: 'done', label: 'Result' },
]

/* The process allows the customer to re-enter an ID that failed validation
 * rather than ending the journey there. After this many tries the screen stops
 * suggesting another attempt and offers a branch instead — the loop in the
 * diagram is a loop, but it is not infinite. */
const MAX_ID_ATTEMPTS = 3

/* "Multiple tries, reminders to the customer to use sufficient light" — the
 * reminder is shown from the second failed scan, when it is actually useful. */
const LIGHTING_REMINDER_AFTER = 1

/* One place for every outcome's wording, so the seal, the heading and the
 * ledger line can never drift from each other. "review" exists because the
 * face match provider can answer "In Review" — the customer is neither
 * approved nor turned away, and the copy has to say so without alarming them. */
const OUTCOME_COPY: Record<DecisionStatus, {
  tone: string
  mark: string
  title: string
  ledger: string
}> = {
  approved: {
    tone: 'pass',
    mark: '✓',
    title: 'Identity verified',
    ledger: 'Identity verified',
  },
  rejected: {
    tone: 'fail',
    mark: '✗',
    title: 'We could not verify you',
    ledger: 'Verification declined',
  },
  review: {
    tone: 'review',
    mark: '◷',
    title: 'One more check to go',
    ledger: 'Sent for manual review',
  },
}

/* Shown dimmed in the ledger before anything has happened, so the rail states
 * upfront exactly what will be retained. These match what the API records. */
const WILL_RECORD = [
  'ID number check',
  'Face image reference',
  'Liveness result and score',
  'Verification decision',
  'Notifications sent',
]

/* Shown while the verification request is in flight. The backend runs these in
 * this order; we cannot observe its progress mid-request, so they are listed as
 * "what is running" rather than animated as if we knew which one was live. */
const RUNNING_STEPS = [
  'Screening the request',
  'Reading your ID document',
  'Comparing your face to your document photo',
  'Matching the SIM registration (RICA)',
  'Comparing your face to Home Affairs',
]

export default function App() {
  const [step, setStep] = useState<Step>('start')
  const [documentType, setDocumentType] = useState<DocumentKind>('SA_ID')
  const [consent, setConsent] = useState(false)
  const [idNumber, setIdNumber] = useState('')
  const [fullName, setFullName] = useState('')
  const [msisdn, setMsisdn] = useState('')
  const [newSim, setNewSim] = useState('')
  const [transaction, setTransaction] = useState<TransactionKind>('sim_swap')
  const [targetNetwork, setTargetNetwork] = useState('')
  const [validation, setValidation] = useState<ValidationResponse | null>(null)
  const [idAttempts, setIdAttempts] = useState(0)
  const [documentImage, setDocumentImage] = useState<string | null>(null)
  const [selfieId, setSelfieId] = useState<string | null>(null)
  const [liveness, setLiveness] = useState<LivenessResponse | null>(null)
  const [faceAttempts, setFaceAttempts] = useState(0)
  const [decision, setDecision] = useState<VerificationDecision | null>(null)
  const [notifications, setNotifications] = useState<NotificationRecord[]>([])
  const [history, setHistory] = useState<AttemptRecord[]>([])
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const stepIndex = STEPS.findIndex((s) => s.key === step)
  const isPassport = documentType === 'PASSPORT'
  const documentNoun = isPassport ? 'passport' : 'SA ID'

  function record(label: string, kind: LedgerEntry['kind'], detail?: string) {
    setEntries((prev) => [...prev, stamp(label, kind, detail)])
  }

  function startOver() {
    setStep('start')
    setDocumentType('SA_ID')
    setConsent(false)
    setIdNumber('')
    setFullName('')
    setMsisdn('')
    setNewSim('')
    setTransaction('sim_swap')
    setTargetNetwork('')
    setValidation(null)
    setIdAttempts(0)
    setDocumentImage(null)
    setSelfieId(null)
    setLiveness(null)
    setFaceAttempts(0)
    setDecision(null)
    setNotifications([])
    setHistory([])
    setEntries([])
    setError(null)
  }

  function onStart() {
    record(
      `Consent given · ${isPassport ? 'Passport' : 'SA ID'}`,
      'pass',
      'RICA and POPIA consent recorded',
    )
    setStep('id')
  }

  async function onValidate(event: FormEvent) {
    event.preventDefault()
    // A passport number has no SA checksum to run against it, so the process
    // sends passport holders straight past this check to the document scan —
    // the number is verified against the scanned document instead.
    if (isPassport) {
      record('Passport number accepted', 'info', 'No SA ID checksum applies')
      setStep('document')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await validateId(idNumber.trim())
      setValidation(result)
      if (result.valid) {
        record('ID number accepted', 'pass', `${result.id_number_length} digits · all checks passed`)
        setStep('document')
      } else {
        setIdAttempts((n) => n + 1)
        record('ID number rejected', 'fail', result.failed_checks.join(', '))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The check could not be completed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  function onDocumentCapture(dataUrl: string) {
    setDocumentImage(dataUrl)
    record('ID document captured', 'info', `${documentNoun} · ready to read`)
    setStep('face')
  }

  async function onCapture(dataUrl: string) {
    setLoading(true)
    setError(null)
    setLiveness(null)
    try {
      const selfie = await captureSelfie(idNumber.trim(), dataUrl)
      setSelfieId(selfie.selfie_id)
      record('Image stored', 'info', `${selfie.selfie_id.slice(0, 12)}… · ${selfie.content_type}`)

      const live = await checkLiveness(selfie.selfie_id)
      setLiveness(live)
      if (live.is_live) {
        record('Live person confirmed', 'pass', `score ${live.score} · ${live.provider}`)
        setStep('confirm')
      } else {
        setFaceAttempts((n) => n + 1)
        record('Liveness not confirmed', 'fail', `score ${live.score} · ${live.detail}`)
      }
    } catch (err) {
      setFaceAttempts((n) => n + 1)
      setError(err instanceof Error ? err.message : 'The scan could not be completed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  async function onConfirm() {
    if (!selfieId || !documentImage) return
    setLoading(true)
    setError(null)
    try {
      const result = await verifyIdentity({
        id_number: idNumber.trim(),
        selfie_id: selfieId,
        consent,
        document_type: documentType,
        document_image: documentImage,
        full_name: fullName.trim() || undefined,
        msisdn: msisdn.trim() || undefined,
        new_sim_number: newSim.trim() || undefined,
        device_id: getDeviceId(),
        transaction,
        target_network: targetNetwork.trim() || undefined,
      })
      setDecision(result)

      // Each backend check becomes its own ledger line, so the trail shows what
      // every stage returned rather than only the final verdict.
      for (const c of result.checks) {
        record(
          c.label,
          c.status === 'pass' ? 'pass' : c.status === 'fail' ? 'fail' : 'info',
          [c.detail, c.score !== null ? `score ${c.score}` : null].filter(Boolean).join(' · '),
        )
      }

      record(
        OUTCOME_COPY[result.status].ledger,
        result.status === 'approved' ? 'pass' : result.status === 'rejected' ? 'fail' : 'info',
        result.method,
      )

      const id = idNumber.trim()
      const [inbox, past] = await Promise.all([getNotifications(id), getHistory(id)])
      setNotifications(inbox)
      setHistory(past)
      if (inbox.length > 0) {
        record('You were notified', 'info', inbox.map((n) => n.channel).join(', '))
      }
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification could not be completed. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brandmark">MTN</span>
        <span className="topbar-title">SIM swap · identity check</span>
        <span className="topbar-env">Secure</span>
      </header>

      <div className="layout">
        <main className="stage">
          <ol className="spine">
            {STEPS.map((s, i) => (
              <li
                key={s.key}
                className={`spine-step${i < stepIndex ? ' is-done' : ''}${
                  i === stepIndex ? ' is-current' : ''
                }`}
                aria-current={i === stepIndex ? 'step' : undefined}
              >
                <span className="spine-node">
                  <span className="spine-dot">{i < stepIndex ? '✓' : i + 1}</span>
                  <span className="spine-name">{s.label}</span>
                </span>
                {i < STEPS.length - 1 && <span className="spine-line" aria-hidden="true" />}
              </li>
            ))}
          </ol>

          {error && (
            <p className="alert" role="alert">
              <span aria-hidden="true">!</span>
              <span>{error}</span>
            </p>
          )}

          {step === 'start' && (
            <section className="card">
              <p className="eyebrow">Step 1 of 6 · Start</p>
              <h1 className="card-title">Let&apos;s verify your identity</h1>
              <p className="card-lede">
                Tell us which document you are using. We need your permission before
                we check anything.
              </p>

              <fieldset className="choice">
                <legend className="field-label">Which document do you have?</legend>
                {(
                  [
                    ['SA_ID', 'South African ID'],
                    ['PASSPORT', 'Passport'],
                  ] as [DocumentKind, string][]
                ).map(([value, label]) => (
                  <label key={value} className={documentType === value ? 'is-on' : ''}>
                    <input
                      type="radio"
                      name="document-type"
                      value={value}
                      checked={documentType === value}
                      onChange={() => setDocumentType(value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </fieldset>

              <label className="consent" htmlFor="consent">
                <input
                  id="consent"
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  I agree to MTN verifying my identity for this request, including
                  checking my ID document, my face and my SIM registration.
                  <span className="field-hint">
                    Required by RICA and POPIA. Nothing is checked until you agree.
                  </span>
                </span>
              </label>

              <button
                type="button"
                className="btn btn-primary"
                onClick={onStart}
                disabled={!consent}
              >
                Agree and continue
              </button>
            </section>
          )}

          {step === 'id' && (
            <section className="card">
              <p className="eyebrow">Step 2 of 6 · Details</p>
              <h1 className="card-title">Your SIM swap details</h1>
              <p className="card-lede">
                We check these against the registration on your SIM before anything
                is verified.
              </p>

              <form onSubmit={onValidate}>
                <fieldset className="choice">
                  <legend className="field-label">What are you doing?</legend>
                  {(
                    [
                      ['sim_swap', 'Swap my SIM'],
                      ['number_port', 'Move my number'],
                    ] as [TransactionKind, string][]
                  ).map(([value, label]) => (
                    <label key={value} className={transaction === value ? 'is-on' : ''}>
                      <input
                        type="radio"
                        name="transaction"
                        value={value}
                        checked={transaction === value}
                        onChange={() => setTransaction(value)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>
                <label className="field" htmlFor="id-number">
                  <span className="field-label">
                    {isPassport ? 'Passport number' : 'SA ID number'}
                  </span>
                  <input
                    id="id-number"
                    className={isPassport ? 'field-input field-input-text' : 'field-input'}
                    name="id-number"
                    inputMode={isPassport ? 'text' : 'numeric'}
                    autoComplete="off"
                    placeholder={isPassport ? 'As printed on your passport' : '0000000000000'}
                    maxLength={isPassport ? 32 : 13}
                    value={idNumber}
                    onChange={(e) => setIdNumber(e.target.value)}
                  />
                  {!isPassport && (
                    <span className="field-hint">{idNumber.trim().length} / 13 digits</span>
                  )}
                </label>

                <label className="field" htmlFor="full-name">
                  <span className="field-label">Full name</span>
                  <input
                    id="full-name"
                    className="field-input field-input-text"
                    autoComplete="name"
                    placeholder="As registered on your SIM"
                    maxLength={200}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </label>

                <label className="field" htmlFor="msisdn">
                  <span className="field-label">Number being swapped</span>
                  <input
                    id="msisdn"
                    className="field-input"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="0820000000"
                    maxLength={32}
                    value={msisdn}
                    onChange={(e) => setMsisdn(e.target.value)}
                  />
                </label>

                {transaction === 'sim_swap' ? (
                  <label className="field" htmlFor="new-sim">
                    <span className="field-label">New SIM number</span>
                    <input
                      id="new-sim"
                      className="field-input"
                      inputMode="numeric"
                      placeholder="Printed on the new SIM"
                      maxLength={32}
                      value={newSim}
                      onChange={(e) => setNewSim(e.target.value)}
                    />
                  </label>
                ) : (
                  <label className="field" htmlFor="target-network">
                    <span className="field-label">Network you are moving to</span>
                    <input
                      id="target-network"
                      className="field-input field-input-text"
                      placeholder="Receiving network"
                      maxLength={64}
                      value={targetNetwork}
                      onChange={(e) => setTargetNetwork(e.target.value)}
                    />
                  </label>
                )}

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || idNumber.trim().length === 0}
                >
                  {loading ? 'Checking…' : 'Check my details'}
                </button>
              </form>

              {validation && !validation.valid && (
                <>
                  <ul className="checks">
                    {Object.entries(validation.checks).map(([name, passed]) => (
                      <li key={name} className={passed ? 'pass' : 'fail'}>
                        <span className="mark" aria-hidden="true">
                          {passed ? '✓' : '✗'}
                        </span>
                        <span>{CHECK_LABELS[name] ?? name}</span>
                      </li>
                    ))}
                  </ul>
                  {/* The recapture loop: a mistyped digit is the usual cause, so
                      the customer gets to correct it rather than start again. */}
                  <p className="field-hint">
                    {idAttempts < MAX_ID_ATTEMPTS
                      ? `Check the number and try again. Attempt ${idAttempts} of ${MAX_ID_ATTEMPTS}.`
                      : 'That number still is not valid. Check your document, or continue with a passport instead.'}
                  </p>
                </>
              )}
            </section>
          )}

          {step === 'document' && (
            <section className="card">
              <p className="eyebrow">Step 3 of 6 · ID scan</p>
              <h1 className="card-title">Photograph your {documentNoun}</h1>
              <p className="card-lede">
                Lay it flat in good light and fill the frame. We read your name and
                number off it, and compare its photo to your face.
              </p>

              <CameraCapture subject="document" onCapture={onDocumentCapture} disabled={loading} />
            </section>
          )}

          {step === 'face' && (
            <section className="card">
              <p className="eyebrow">Step 4 of 6 · Face scan</p>
              <h1 className="card-title">Scan your face</h1>
              <p className="card-lede">
                Hold your phone at eye level in good light. Stay still — we check that a
                live person is present, not a photo.
              </p>

              <CameraCapture subject="face" onCapture={onCapture} disabled={loading} />

              {loading && <p className="field-hint">Checking that you are live…</p>}

              {liveness && !liveness.is_live && (
                <p className="verdict verdict-fail">
                  <span className="verdict-mark" aria-hidden="true">
                    ✗
                  </span>
                  <span>
                    {liveness.detail}. Move somewhere brighter, fill the frame with your
                    face, and scan again.
                  </span>
                </p>
              )}

              {faceAttempts > LIGHTING_REMINDER_AFTER && (
                <p className="field-hint">
                  Still not working? Face a window or a lamp so the light falls on your
                  face rather than behind you, and take off hats or sunglasses.
                </p>
              )}
            </section>
          )}

          {step === 'confirm' && !loading && (
            <section className="card">
              <p className="eyebrow">Step 5 of 6 · Confirm</p>
              <h1 className="card-title">Confirm your SIM swap</h1>
              <p className="card-lede">
                Your face matched a live capture. Confirming runs the remaining
                identity checks and records the outcome against your number.
              </p>

              <p className="verdict verdict-pass">
                <span className="verdict-mark" aria-hidden="true">
                  ✓
                </span>
                <span>
                  Live person confirmed — score {liveness?.score} via {liveness?.provider}.
                </span>
              </p>

              <p className="verdict verdict-pass">
                <span className="verdict-mark" aria-hidden="true">
                  ✓
                </span>
                <span>
                  Your {documentNoun} was captured and is ready to be read.
                </span>
              </p>

              <div className="btn-row">
                <button type="button" className="btn btn-primary" onClick={onConfirm}>
                  Confirm and verify
                </button>
                <button type="button" className="btn btn-quiet" onClick={startOver}>
                  Cancel
                </button>
              </div>
            </section>
          )}

          {/* The request runs four checks server-side and takes ~12s in sandbox,
              so it gets a real screen rather than a button spinner. */}
          {step === 'confirm' && loading && (
            <section className="card" aria-live="polite" aria-busy="true">
              <p className="eyebrow">Step 5 of 6 · Running checks</p>
              <h1 className="card-title">Checking your identity</h1>
              <p className="card-lede">
                This takes about fifteen seconds. Keep this screen open.
              </p>

              <ul className="running">
                {RUNNING_STEPS.map((label) => (
                  <li key={label}>
                    <span className="running-dot" aria-hidden="true" />
                    <span>{label}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {step === 'done' && decision && (
            <section className="card" aria-live="polite">
              <div className={`outcome-seal ${OUTCOME_COPY[decision.status].tone}`}>
                {OUTCOME_COPY[decision.status].mark}
              </div>
              <h1 className="outcome-title">{OUTCOME_COPY[decision.status].title}</h1>
              <p className="outcome-reason">{decision.reason}</p>

              {decision.authorisation_token && (
                <p className="match-readout">
                  <span>Authorisation reference</span>
                  <strong>{decision.authorisation_token.slice(0, 12)}…</strong>
                </p>
              )}

              {decision.match_score !== null && (
                <p className="match-readout">
                  <span>Face match against Home Affairs</span>
                  <strong>{decision.match_score}/100</strong>
                </p>
              )}

              {decision.checks.length > 0 && (
                <>
                  <p className="section-head">What we checked</p>
                  <ul className="checks">
                    {decision.checks.map((c) => (
                      <li key={c.name} className={`check-${c.status}`}>
                        <span className="mark" aria-hidden="true">
                          {c.status === 'pass'
                            ? '✓'
                            : c.status === 'fail'
                              ? '✗'
                              : c.status === 'review'
                                ? '◷'
                                : '–'}
                        </span>
                        <span>
                          <strong>{c.label}</strong>
                          <span className="check-detail">{c.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {notifications.length > 0 && (
                <>
                  <p className="section-head">Messages sent to you</p>
                  <ul className="inbox">
                    {notifications.map((n) => (
                      <li key={n.id}>
                        <span className="chan">{n.channel}</span>
                        <span>{n.message}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {history.length > 0 && (
                <>
                  <p className="section-head">Previous attempts</p>
                  <ul className="inbox">
                    {history.map((h) => (
                      <li key={h.id}>
                        <span className="chan">{h.method}</span>
                        <span>
                          {h.status === 'approved' ? 'Verified' : 'Declined'}
                          {h.reason ? ` — ${h.reason}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div className="btn-row">
                <button type="button" className="btn btn-quiet" onClick={startOver}>
                  Start another check
                </button>
              </div>
            </section>
          )}
        </main>

        <Ledger entries={entries} pending={WILL_RECORD} />
      </div>
    </div>
  )
}
