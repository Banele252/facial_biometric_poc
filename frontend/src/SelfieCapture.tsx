import { useEffect, useRef, useState } from 'react'

interface Props {
  onCapture: (dataUrl: string) => void
  disabled?: boolean
}

/**
 * Selfie capture (HT2-11). Prefers the live camera via getUserMedia and falls
 * back to a file upload when the camera is unavailable or permission is denied,
 * so the journey is demonstrable on any device.
 *
 * The corner brackets are the framing guide from the CARB journey mockup: they
 * sit yellow while the camera warms up and turn green once it is delivering
 * frames, so "ready" is legible without a separate status line.
 */
export default function SelfieCapture({ onCapture, disabled }: Props) {
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
          video: { facingMode: 'user' },
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
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
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
      <div className={`capture-frame${cameraReady ? ' is-ready' : ''}`}>
        {cameraError ? (
          <p className="capture-placeholder">{cameraError}</p>
        ) : (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="capture-video" />
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
          {cameraReady ? 'Scan my face' : 'Starting camera…'}
        </button>
      )}

      <label className="capture-upload">
        {cameraError ? 'Choose a photo' : 'Or upload a photo instead'}
        <input type="file" accept="image/*" onChange={onFile} disabled={disabled} />
      </label>
    </div>
  )
}
