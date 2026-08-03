import { useEffect, useRef, useState } from 'react'

interface Props {
  onCapture: (dataUrl: string) => void
  disabled?: boolean
}

/**
 * Mirrors SelfieCapture, but for a photo of the customer's SA ID document
 * (HT2-17..20 — the OCR/document fallback, see VerificationRequest.document_image
 * in Backend/app/routers/verifications.py). Two differences from a selfie
 * capture: the video is not mirrored (a mirrored document photo reads
 * backwards to the OCR step), and the rear camera is preferred over the
 * front-facing one, since a document is usually held out and photographed
 * with the back camera, not framed like a face.
 */
export default function DocumentCapture({ onCapture, disabled }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('This browser cannot open the camera. Upload a photo instead.')
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          setCameraReady(true)
        }
      } catch {
        setCameraError('Camera access was declined. Upload a photo instead.')
      }
    }
    start()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  function captureFromVideo() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 800
    canvas.height = video.videoHeight || 500
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    onCapture(canvas.toDataURL('image/jpeg', 0.9))
  }

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => onCapture(String(reader.result))
    reader.readAsDataURL(file)
  }

  return (
    <div>
      <div className={`capture-frame is-document${cameraReady ? ' is-ready' : ''}`}>
        {cameraError ? (
          <p className="capture-placeholder">{cameraError}</p>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="capture-video is-document" />
            <span className="capture-bracket tl" />
            <span className="capture-bracket tr" />
            <span className="capture-bracket bl" />
            <span className="capture-bracket br" />
          </>
        )}
      </div>
      {!cameraError && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={captureFromVideo}
          disabled={disabled || !cameraReady}
        >
          {cameraReady ? 'Capture ID document' : 'Starting camera…'}
        </button>
      )}
      <label className="capture-upload">
        {cameraError ? 'Choose a photo' : 'Or upload a photo of your ID instead'}
        <input type="file" accept="image/*" onChange={onFile} disabled={disabled} />
      </label>
    </div>
  )
}
