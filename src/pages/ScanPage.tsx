/**
 * ScanPage — Scan flow (Requirements 2.1–2.4).
 *
 * Screens / states:
 *   'idle'        — initial: "I-scan" button + file/PDF upload option
 *   'camera'      — live viewfinder with page-outline guide overlay (Req 2.1)
 *   'processing'  — spinner while canvas pipeline runs
 *   'quality'     — blurry / dark error with "I-scan Ulit" (Req 2.3)
 *   'preview'     — enhanced image preview; tap "Gamitin" to proceed
 *
 * onImageReady(blob, dataUrl) → handed back to App so the confirm screen
 * (Task 6) can receive it.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { checkQuality, processImage, preparePDF } from '../utils/imageProcessing'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ScanResult {
  blob: Blob
  dataUrl: string
  isPDF: boolean
}

interface ScanPageProps {
  onImageReady: (result: ScanResult) => void
  onCancel: () => void
}

// ─── Tagalog strings ──────────────────────────────────────────────────────────

const T = {
  title: 'I-scan ang Papel',
  scanBtn: 'I-scan ang Papel',
  uploadBtn: 'Mag-upload ng Larawan / PDF',
  captureBtnLabel: 'Kumuha ng larawan',
  cancelBtn: 'Kanselahin',
  retakeBtn: 'I-scan Ulit',
  useBtn: 'Gamitin',
  processing: 'Pinoproseso…',
  cameraError: 'Hindi ma-access ang camera. Subukan ang pag-upload.',
  qualityTitle: 'Hindi Malinaw ang Larawan',
  darkMsg: 'Masyadong madilim ang larawan. Pumunta sa mas maliwanag na lugar at subukang muli.',
  blurryMsg: 'Malinaw ba ang larawan? Siguraduhing hindi gumagalaw ang papel at subukang muli.',
  darkAndBlurryMsg: 'Masyadong madilim at malabo ang larawan. Pumunta sa mas maliwanag na lugar, huwag gawin itong gumagalaw, at subukang muli.',
  pdfLabel: 'PDF',
  pageGuideHint: 'Ilagay ang papel sa loob ng balangkas',
  flipCamera: 'Palitan ang camera',
}

// ─── Helper: shared button styles ────────────────────────────────────────────

function PrimaryButton({
  onClick,
  disabled,
  children,
  className = '',
}: {
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'w-full min-h-touch flex items-center justify-center gap-2',
        'rounded-btn bg-action text-text font-bold text-sobre-base',
        'active:opacity-80 disabled:opacity-40 transition-opacity',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function OutlineButton({
  onClick,
  children,
  className = '',
}: {
  onClick?: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'w-full min-h-touch flex items-center justify-center gap-2',
        'rounded-btn border border-primary text-primary font-bold text-sobre-base',
        'active:bg-primary/10 transition-colors',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  )
}

// ─── Camera viewfinder ────────────────────────────────────────────────────────

interface CameraViewProps {
  onCapture: (blob: Blob) => void
  onClose: () => void
}

function CameraView({ onCapture, onClose }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [error, setError] = useState('')
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [ready, setReady] = useState(false)

  const startCamera = useCallback(async (facing: 'environment' | 'user') => {
    // Stop any existing stream
    streamRef.current?.getTracks().forEach((t) => t.stop())
    setReady(false)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setReady(true)
      }
    } catch {
      setError(T.cameraError)
    }
  }, [])

  useEffect(() => {
    startCamera(facingMode)
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode])

  const handleCapture = () => {
    const video = videoRef.current
    if (!video || !ready) return

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(video, 0, 0)

    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(blob)
      },
      'image/jpeg',
      0.95,
    )
  }

  const handleFlip = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Video viewfinder */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
          aria-hidden="true"
        />

        {/* Page outline guide overlay (Req 2.1) */}
        {ready && (
          <div
            className="absolute inset-0 pointer-events-none"
            aria-hidden="true"
          >
            {/* Semi-transparent vignette around the guide */}
            <svg
              className="w-full h-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Full overlay */}
              <rect width="100" height="100" fill="rgba(0,0,0,0.45)" />
              {/* Cut-out rectangle representing a document page */}
              <rect
                x="8"
                y="12"
                width="84"
                height="76"
                rx="2"
                ry="2"
                fill="black"
                style={{ mixBlendMode: 'destination-out' as unknown as React.CSSProperties['mixBlendMode'] }}
              />
            </svg>

            {/* Dashed border on the cut-out */}
            <div
              className="absolute"
              style={{
                top: '12%',
                left: '8%',
                right: '8%',
                bottom: '12%',
                border: '2px dashed rgba(245, 180, 0, 0.9)',
                borderRadius: '6px',
              }}
            />

            {/* Corner markers */}
            {[
              { top: '12%', left: '8%', borderTop: true, borderLeft: true },
              { top: '12%', right: '8%', borderTop: true, borderRight: true },
              { bottom: '12%', left: '8%', borderBottom: true, borderLeft: true },
              { bottom: '12%', right: '8%', borderBottom: true, borderRight: true },
            ].map((corner, i) => {
              const style: React.CSSProperties = {
                position: 'absolute',
                width: 24,
                height: 24,
                borderColor: '#F5B400',
                borderStyle: 'solid',
                borderTopWidth: corner.borderTop ? 3 : 0,
                borderLeftWidth: corner.borderLeft ? 3 : 0,
                borderRightWidth: corner.borderRight ? 3 : 0,
                borderBottomWidth: corner.borderBottom ? 3 : 0,
                top: corner.top,
                left: corner.left,
                right: corner.right,
                bottom: corner.bottom,
              }
              return <div key={i} style={style} aria-hidden="true" />
            })}

            {/* Hint text */}
            <div className="absolute bottom-[14%] left-0 right-0 flex justify-center">
              <span className="text-white text-sobre-label bg-black/50 px-3 py-1 rounded-full">
                {T.pageGuideHint}
              </span>
            </div>
          </div>
        )}

        {/* Camera error */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
            <p className="text-white text-sobre-base text-center">{error}</p>
          </div>
        )}
      </div>

      {/* Camera controls */}
      <div className="bg-black px-6 py-5 flex items-center justify-between gap-4 shrink-0 safe-area-pb">
        {/* Cancel */}
        <button
          onClick={onClose}
          aria-label={T.cancelBtn}
          className="min-h-touch min-w-touch flex items-center justify-center rounded-full bg-white/20 text-white text-sobre-label px-4 active:bg-white/30 transition-colors"
        >
          {T.cancelBtn}
        </button>

        {/* Shutter */}
        <button
          onClick={handleCapture}
          disabled={!ready}
          aria-label={T.captureBtnLabel}
          className="w-16 h-16 rounded-full bg-white border-4 border-action active:scale-95 disabled:opacity-50 transition-transform shrink-0"
        />

        {/* Flip camera */}
        <button
          onClick={handleFlip}
          aria-label={T.flipCamera}
          className="min-h-touch min-w-touch flex items-center justify-center rounded-full bg-white/20 text-white text-2xl active:bg-white/30 transition-colors"
        >
          🔄
        </button>
      </div>
    </div>
  )
}

// ─── Quality error screen ─────────────────────────────────────────────────────

interface QualityErrorProps {
  dark: boolean
  blurry: boolean
  onRetry: () => void
  onCancel: () => void
}

function QualityError({ dark, blurry, onRetry, onCancel }: QualityErrorProps) {
  const msg =
    dark && blurry
      ? T.darkAndBlurryMsg
      : dark
        ? T.darkMsg
        : T.blurryMsg

  return (
    <div className="flex flex-col h-full px-sobre-md py-sobre-md gap-6">
      {/* Icon */}
      <div className="flex justify-center mt-8">
        <span className="text-6xl" aria-hidden="true">📸</span>
      </div>

      {/* Title */}
      <h2 className="text-sobre-title font-bold text-text text-center">
        {T.qualityTitle}
      </h2>

      {/* Message (Req 2.3 — plain Tagalog words) */}
      <div className="bg-status-kulang-bg border border-status-kulang-text/20 rounded-card p-sobre-md">
        <p className="text-sobre-base text-status-kulang-text text-center leading-relaxed">
          {msg}
        </p>
      </div>

      {/* Quality flags */}
      <div className="flex justify-center gap-4">
        {dark && (
          <span className="flex items-center gap-1 text-sobre-label text-status-kulang-text bg-status-kulang-bg px-3 py-1 rounded-full">
            🌑 Madilim
          </span>
        )}
        {blurry && (
          <span className="flex items-center gap-1 text-sobre-label text-status-kulang-text bg-status-kulang-bg px-3 py-1 rounded-full">
            💧 Malabo
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 mt-auto">
        <PrimaryButton onClick={onRetry}>
          📷 {T.retakeBtn}
        </PrimaryButton>
        <OutlineButton onClick={onCancel}>
          {T.cancelBtn}
        </OutlineButton>
      </div>
    </div>
  )
}

// ─── Main ScanPage ────────────────────────────────────────────────────────────

type ScanState =
  | { kind: 'idle' }
  | { kind: 'camera' }
  | { kind: 'processing' }
  | { kind: 'quality'; dark: boolean; blurry: boolean; raw: Blob }
  | { kind: 'preview'; processed: ScanResult }

export default function ScanPage({ onImageReady, onCancel }: ScanPageProps) {
  const [state, setState] = useState<ScanState>({ kind: 'idle' })
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Process a captured/uploaded image ─────────────────────────────────────

  const handleRawBlob = useCallback(async (raw: Blob, isPDF = false) => {
    setState({ kind: 'processing' })

    try {
      if (isPDF) {
        // PDFs skip canvas pipeline — quality checks not applicable
        const result = await preparePDF(raw as File)
        setState({
          kind: 'preview',
          processed: { blob: result.blob, dataUrl: result.dataUrl, isPDF: true },
        })
        return
      }

      // Quality check first (Req 2.3)
      const quality = await checkQuality(raw)

      if (quality.dark || quality.blurry) {
        setState({ kind: 'quality', dark: quality.dark, blurry: quality.blurry, raw })
        return
      }

      // Process pipeline (Req 2.2)
      const result = await processImage(raw)
      setState({
        kind: 'preview',
        processed: { blob: result.blob, dataUrl: result.dataUrl, isPDF: false },
      })
    } catch {
      // On processing error fall through to quality screen with both flags
      setState({ kind: 'quality', dark: true, blurry: true, raw })
    }
  }, [])

  // ── File / PDF upload (Req 2.4) ───────────────────────────────────────────

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      // Reset input so the same file can be re-selected
      e.target.value = ''

      if (file.type === 'application/pdf') {
        await handleRawBlob(file, true)
      } else {
        await handleRawBlob(file)
      }
    },
    [handleRawBlob],
  )



  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Hidden file input for upload (Req 2.4) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        aria-hidden="true"
        onChange={handleFileChange}
      />

      {/* Camera overlay — full-screen, rendered on top */}
      {state.kind === 'camera' && (
        <CameraView
          onCapture={(blob) => {
            handleRawBlob(blob)
          }}
          onClose={() => setState({ kind: 'idle' })}
        />
      )}

      {/* Main panel — shows under camera overlay */}
      <main className="flex flex-col h-full bg-background overflow-y-auto">
        {/* Page header */}
        <div className="px-sobre-md pt-sobre-md pb-2 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              aria-label="Bumalik"
              className="min-h-touch min-w-touch flex items-center justify-center rounded-full text-primary text-sobre-title active:bg-primary/10 transition-colors -ml-2"
            >
              ←
            </button>
            <h1 className="text-sobre-title font-bold text-text">{T.title}</h1>
          </div>
        </div>

        {/* ── Idle: show action buttons ──────────────────────────────────── */}
        {state.kind === 'idle' && (
          <div className="flex flex-col gap-4 px-sobre-md py-sobre-md flex-1">
            {/* Illustration */}
            <div className="flex justify-center py-8">
              <div
                className="w-48 h-64 rounded-card border-2 border-dashed border-primary/40 flex flex-col items-center justify-center gap-3 bg-card"
                aria-hidden="true"
              >
                <span className="text-6xl">📄</span>
                <span className="text-sobre-label text-text-secondary text-center px-4">
                  Larawan ng papel
                </span>
              </div>
            </div>

            {/* Primary: open camera (Req 2.1) */}
            <PrimaryButton onClick={() => setState({ kind: 'camera' })}>
              📷 {T.scanBtn}
            </PrimaryButton>

            {/* Secondary: file/PDF upload (Req 2.4) */}
            <OutlineButton onClick={() => fileInputRef.current?.click()}>
              📁 {T.uploadBtn}
            </OutlineButton>
          </div>
        )}

        {/* ── Processing spinner ─────────────────────────────────────────── */}
        {state.kind === 'processing' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 px-sobre-md">
            <div
              className="w-16 h-16 rounded-full border-4 border-primary border-t-transparent animate-spin"
              aria-hidden="true"
            />
            <p className="text-sobre-base text-text-secondary text-center">
              {T.processing}
            </p>
          </div>
        )}

        {/* ── Quality error (Req 2.3) ────────────────────────────────────── */}
        {state.kind === 'quality' && (
          <QualityError
            dark={state.dark}
            blurry={state.blurry}
            onRetry={() => setState({ kind: 'camera' })}
            onCancel={() => setState({ kind: 'idle' })}
          />
        )}

        {/* ── Preview: show enhanced image ───────────────────────────────── */}
        {state.kind === 'preview' && (
          <div className="flex flex-col gap-4 px-sobre-md py-sobre-md flex-1">
            {/* Enhanced image */}
            <div className="flex justify-center">
              {state.processed.isPDF ? (
                /* PDF preview placeholder */
                <div className="w-full max-w-sm h-64 rounded-card bg-card border border-border flex flex-col items-center justify-center gap-2 shadow-sm">
                  <span className="text-5xl" aria-hidden="true">📋</span>
                  <span className="text-sobre-base font-semibold text-text">
                    {T.pdfLabel}
                  </span>
                  <span className="text-sobre-label text-text-secondary">
                    Handa nang i-upload
                  </span>
                </div>
              ) : (
                <img
                  src={state.processed.dataUrl}
                  alt="Na-enhance na larawan ng papel"
                  className="w-full max-w-sm rounded-card shadow-md object-contain max-h-[55vh]"
                />
              )}
            </div>

            {/* Quality-pass badge */}
            {!state.processed.isPDF && (
              <div className="flex justify-center">
                <span className="flex items-center gap-1 text-sobre-label text-status-ayos-text bg-status-ayos-bg px-3 py-1 rounded-full">
                  ✓ Malinaw ang larawan
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-3 mt-auto">
              {/* Use this image */}
              <PrimaryButton onClick={() => onImageReady(state.processed)}>
                ✓ {T.useBtn}
              </PrimaryButton>

              {/* Retake */}
              <OutlineButton onClick={() => setState({ kind: 'camera' })}>
                📷 {T.retakeBtn}
              </OutlineButton>

              {/* Upload different file */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full min-h-touch flex items-center justify-center gap-2 rounded-btn border border-border text-text-secondary font-semibold text-sobre-base active:bg-background transition-colors"
              >
                📁 Ibang larawan / PDF
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
