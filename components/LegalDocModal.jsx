'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'
import { sanitizeLegalHtml, legalPath } from '@/lib/legal'
import { IconClose, IconCheck, IconArrowRight } from '@/components/icons'

// ─── Lecture d'un document, avec verrou de défilement ─────────────────────────
//
// La case « j'accepte » ne s'ouvre qu'une fois le document parcouru jusqu'au
// bout. Le verrou ne prouve pas la lecture — rien ne le peut — mais il
// empêche le geste réflexe : cocher sans avoir vu ce qu'on accepte.
//
// Pour que le verrou soit tenable, il faut qu'on sache où on en est. D'où la
// souche de billet à gauche du texte : elle se remplit à mesure qu'on
// descend, et la perforation marque le point où la case s'ouvre. C'est le
// seul ornement de ce composant, et il porte l'information.
//
// Trois pièges traités :
//   • un document plus court que la fenêtre n'a rien à faire défiler — il
//     est lu d'emblée, sinon la case resterait fermée pour toujours ;
//   • la fenêtre peut changer de taille pendant la lecture (rotation,
//     clavier virtuel) : la mesure est refaite ;
//   • une fois lu, un document le reste — remonter dans le texte ne
//     referme pas le verrou.
//
// La mesure est accrochée au nœud lui-même (ref de rappel) et non à un
// effet : le panneau n'existe qu'au second rendu — le premier renvoie null
// le temps que le portail ait une cible — et un effet monté avant lui
// n'aurait rien à écouter, sans jamais être rejoué.

export default function LegalDocModal({ doc, onClose, onRead, alreadyRead = false }) {
  const { t, locale } = useI18n()
  const [mounted, setMounted] = useState(false)
  const [progress, setProgress] = useState(0)
  const [read, setRead] = useState(alreadyRead || doc?.scrollGate === false)

  const bodyRef  = useRef(null)
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const restoreRef = useRef(null)

  useEffect(() => { setMounted(true) }, [])

  // Mesure : où en est-on, et le bas est-il atteint ? La marge de 12 px
  // absorbe les arrondis de sous-pixel des navigateurs — sans elle, un
  // document poussé à fond peut rester à un demi-pixel de la fin.
  const measure = useCallback(() => {
    const el = bodyRef.current
    if (!el) return

    const scrollable = el.scrollHeight - el.clientHeight
    if (scrollable <= 12) {
      setProgress(100)
      setRead(true)
      return
    }

    const ratio = Math.min(1, Math.max(0, el.scrollTop / scrollable))
    setProgress(Math.round(ratio * 100))
    if (el.scrollTop >= scrollable - 12) setRead(true)
  }, [])

  // Le document lu remonte au parent, qui déverrouille la case.
  useEffect(() => {
    if (read) onRead?.(doc.slug)
  }, [read, doc?.slug])

  // Branchée au moment où la zone de texte entre dans le document, et
  // débranchée quand elle en sort.
  const attachBody = useCallback(node => {
    bodyRef.current = node
    if (!node) return

    measure()
    node.addEventListener('scroll', measure, { passive: true })

    // Le contenu arrive après le premier rendu et la fenêtre peut changer
    // de taille : la hauteur utile n'est pas connue une fois pour toutes.
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    if (node.firstElementChild) observer.observe(node.firstElementChild)

    return () => {
      node.removeEventListener('scroll', measure)
      observer.disconnect()
    }
  }, [measure])

  // Le corps peut changer sans que le nœud soit remplacé — la ref de
  // rappel ne rejouerait pas, alors que la hauteur, elle, a changé.
  useEffect(() => { measure() }, [measure, doc?.body])

  // Ouverture : la page derrière ne défile plus, le focus entre dans le
  // panneau, et il revient à son point de départ à la fermeture.
  useEffect(() => {
    if (!mounted) return

    restoreRef.current = document.activeElement
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    return () => {
      document.body.style.overflow = previous
      restoreRef.current?.focus?.()
    }
  }, [mounted])

  // Échap ferme ; Tab tourne en rond dans le panneau — un lecteur ne doit
  // pas se retrouver dans la page du dessous sans savoir comment revenir.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return }
      if (e.key !== 'Tab') return

      const focusable = panelRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (!focusable?.length) return

      const first = focusable[0]
      const last  = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }

    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])

  function toBottom() {
    const el = bodyRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  if (!mounted || !doc) return null

  const effective = doc.effectiveOn
    ? new Date(doc.effectiveOn).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return createPortal(
    <div className="lgm-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose?.() }}>
      <div
        className="lgm-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lgm-title"
      >
        <header className="lgm-head">
          <div className="lgm-head-text">
            <p className="lgm-eyebrow">
              {t('legal.version', { n: doc.version })}
              {effective && <span className="lgm-dot" aria-hidden="true">·</span>}
              {effective && <span>{t('legal.effective', { date: effective })}</span>}
            </p>
            <h2 className="lgm-title" id="lgm-title">{doc.title}</h2>
          </div>
          <button
            type="button"
            className="lgm-close"
            onClick={onClose}
            ref={closeRef}
            aria-label={t('legal.close')}
          >
            <IconClose size={18} />
          </button>
        </header>

        <div className="lgm-stage">
          {/* La souche : elle se remplit avec la lecture. La perforation
              marque le seuil au-delà duquel la case s'ouvre. */}
          <div className="lgm-rail" aria-hidden="true">
            <div className="lgm-rail-fill" style={{ '--lgm-progress': `${progress}%` }} />
          </div>

          <div className="lgm-body" ref={attachBody} tabIndex={0}>
            <div
              className="legal-prose"
              dangerouslySetInnerHTML={{ __html: sanitizeLegalHtml(doc.body) }}
            />
            <p className="lgm-end">
              <a href={legalPath(doc.slug)} target="_blank" rel="noreferrer" className="lgm-end-link">
                {t('legal.openFullPage')}
                <IconArrowRight size={13} />
              </a>
            </p>
          </div>
        </div>

        <footer className={`lgm-foot ${read ? 'is-read' : ''}`}>
          <div className="lgm-foot-state">
            {read ? (
              <p className="lgm-done">
                <IconCheck size={15} />
                {t('legal.docRead')}
              </p>
            ) : (
              <>
                <p className="lgm-hint">{t('legal.scrollHint')}</p>
                <button type="button" className="lgm-tobottom" onClick={toBottom}>
                  {t('legal.toBottom')}
                </button>
              </>
            )}
          </div>

          {/* Le pourcentage est annoncé aux lecteurs d'écran par paliers,
              pas à chaque pixel : aria-live sur une valeur qui change
              soixante fois par seconde ne s'entend plus. */}
          <p className="lgm-sr" aria-live="polite">
            {read ? t('legal.docRead') : t('legal.scrollProgress', { n: Math.round(progress / 25) * 25 })}
          </p>

          <button
            type="button"
            className="lgm-accept"
            onClick={onClose}
            disabled={!read}
          >
            {read ? t('legal.markRead') : t('legal.scrollProgress', { n: progress })}
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}
