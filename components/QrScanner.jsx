'use client'
import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { useI18n } from '@/lib/i18n'

// Scanner QR par caméra. Appelle onScan(text) au premier code détecté, puis
// s'arrête. onClose ferme l'overlay. Utilise la caméra arrière si disponible.
export default function QrScanner({ onScan, onClose }) {
  const { t } = useI18n()
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)
  const rafRef    = useRef(null)
  const streamRef = useRef(null)
  const doneRef   = useRef(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(t('qr.errNoCamera'))
        return
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        const video = videoRef.current
        video.srcObject = stream
        video.setAttribute('playsinline', 'true')
        await video.play()
        rafRef.current = requestAnimationFrame(tick)
      } catch (e) {
        setError(
          e?.name === 'NotAllowedError'
            ? t('qr.errDenied')
            : t('qr.errOpen', { err: e?.name || e?.message || 'error' }),
        )
      }
    }

    function tick() {
      const video  = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || doneRef.current) return
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = video.videoWidth, h = video.videoHeight
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(video, 0, 0, w, h)
        const img = ctx.getImageData(0, 0, w, h)
        const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })
        if (code?.data) {
          doneRef.current = true
          stop()
          onScan(code.data)
          return
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    function stop() {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    start()
    return () => { cancelled = true; stop() }
  }, [onScan])

  return (
    <div className="qrs-overlay" role="dialog" aria-modal="true">
      <div className="qrs-card">
        <div className="qrs-head">
          <span className="qrs-title">{t('qr.title')}</span>
          <button className="qrs-close" onClick={onClose} aria-label={t('qr.close')}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {error ? (
          <div className="qrs-error">
            <p>{error}</p>
            <button className="adp-btn" onClick={onClose}>{t('qr.close')}</button>
          </div>
        ) : (
          <div className="qrs-viewport">
            <video ref={videoRef} className="qrs-video" muted playsInline />
            <div className="qrs-reticle" aria-hidden />
            <p className="qrs-hint">{t('qr.align')}</p>
          </div>
        )}

        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    </div>
  )
}
