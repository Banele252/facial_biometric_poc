import { useEffect, useRef, useState } from 'react'

/** What is being photographed. The two subjects need genuinely different
 *  handling, and nothing else does — see the table in CameraCapture. */
export type CaptureSubject = 'face' | 'document'

interface Props {
  onCapture: (dataUrl: string) => void
  subject: CaptureSubject
  disabled?: boolean
}

/* The only things that actually differ between capturing a face and capturing
 * an ID document. Everything else — permission handling, the upload fallback,
 * canvas encoding, the framing brackets — was duplicated across two files that
 * had already begun to drift in their canvas defaults. */
const SUBJECTS = {
  face: {
    // Front camera: the customer is framing themselves.
    facingMode: 'user' as const,
    fallbackSize: { width: 640, height: 480 },
    // Mirrored, so moving left moves the on-screen face left.
    frameClass: '',
    action: 'Scan my face',
    uploadLabel: 'Or upload a photo instead',
  },
  document: {
    // Rear camera: a document is held out and photographed, not framed.
    facingMode: 'environment' as const,
    fallbackSize: { width: 800, height: 500 },
    // Landscape, and NOT mirrored — mirrored text reads backwards to OCR.
    frameClass: ' is-document',
    action: 'Capture ID document',
    uploadLabel: 'Or upload a photo of your ID instead',
  },
}

/**
 * Live camera capture with an upload fallback (HT2-11, HT2-17..20).
 *
 * Prefers getUserMedia and falls back to a file input when the camera is
 * unavailable or permission is denied, so the journey stays demonstrable on any
 * device. The corner brackets are the framing guide from the CARB journey
 * mockup: yellow while the camera warms up, green once it is delivering frames,
 * so "ready" is legible without a separate status line.
 */
export default function CameraCapture({ onCapture, subject, disabled }: Props) {
  const spec = SUBJECTS[subject]
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
          video: { facingMode: spec.facingMode },
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
  }, [spec.facingMode])

  function captureFromVideo() {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || spec.fallbackSize.width
    canvas.height = video.videoHeight || spec.fallbackSize.height
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
      <div className={`capture-frame${spec.frameClass}${cameraReady ? ' is-ready' : ''}`}>
        {cameraError ? (
          <p className="capture-placeholder">{cameraError}</p>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`capture-video${spec.frameClass}`}
            />
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
          {cameraReady ? spec.action : 'Starting camera…'}
        </button>
      )}

      <label className="capture-upload">
        {cameraError ? 'Choose a photo' : spec.uploadLabel}
        <input type="file" accept="image/*" onChange={onFile} disabled={disabled} />
      </label>
    </div>
  )
}
