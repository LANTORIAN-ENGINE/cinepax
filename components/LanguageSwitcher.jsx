'use client'
import { useState, useEffect, useRef } from 'react'
import { useI18n } from '@/lib/i18n'

// Drapeaux vectoriels — recadrés dans une pastille arrondie (preserveAspectRatio
// "slice") pour garder les proportions officielles quelle que soit la boîte.
function FlagFR() {
  return (
    <svg className="lang-flag-svg" viewBox="0 0 3 2" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="3" height="2" fill="#fff" />
      <rect width="1" height="2" fill="#002654" />
      <rect x="2" width="1" height="2" fill="#ce1126" />
    </svg>
  )
}

function FlagEN() {
  return (
    <svg className="lang-flag-svg" viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <clipPath id="lang-flag-en-clip">
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#lang-flag-en-clip)" stroke="#c8102e" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#c8102e" strokeWidth="6" />
    </svg>
  )
}

const LANGS = [
  { code: 'fr', label: 'FR', Flag: FlagFR },
  { code: 'en', label: 'EN', Flag: FlagEN },
]

// Sélecteur de langue — le déclencheur porte le drapeau courant, la liste
// déroulante reprend l'habillage du menu « Plus » de la barre de navigation.
export default function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n()

  const [open, setOpen]   = useState(false)
  const rootRef           = useRef(null)
  const triggerRef        = useRef(null)
  const optionRefs        = useRef([])

  const current      = LANGS.find(l => l.code === lang) || LANGS[0]
  const currentIndex = LANGS.indexOf(current)

  // Fermeture au clic extérieur et à Échap ; le focus revient au déclencheur
  // pour ne pas perdre la navigation au clavier.
  useEffect(() => {
    if (!open) return
    function onDown(e) { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    function onKey(e) {
      if (e.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // À l'ouverture, le focus part sur la langue active.
  useEffect(() => {
    if (open) optionRefs.current[currentIndex]?.focus()
  }, [open, currentIndex])

  function choose(code) {
    setLang(code)
    setOpen(false)
    triggerRef.current?.focus()
  }

  // Flèches haut/bas pour parcourir la liste.
  function onListKeyDown(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const step = e.key === 'ArrowDown' ? 1 : -1
    const from = optionRefs.current.indexOf(document.activeElement)
    const next = (from + step + LANGS.length) % LANGS.length
    optionRefs.current[next]?.focus()
  }

  return (
    <div className="lang-switch" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`lang-trigger ${open ? 'is-open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${t('lang.label')} — ${t(`lang.${current.code}`)}`}
      >
        <span className="lang-flag"><current.Flag /></span>
        <span className="lang-code">{current.label}</span>
        <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11" className="lang-chevron" aria-hidden>
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div
          className="lang-menu"
          role="listbox"
          aria-label={t('lang.label')}
          onKeyDown={onListKeyDown}
        >
          {LANGS.map(({ code, Flag }, i) => {
            const active = code === lang
            return (
              <button
                key={code}
                ref={el => { optionRefs.current[i] = el }}
                type="button"
                role="option"
                aria-selected={active}
                className={`lang-option ${active ? 'active' : ''}`}
                onClick={() => choose(code)}
                lang={code}
              >
                <span className="lang-flag"><Flag /></span>
                <span className="lang-option-name">{t(`lang.${code}`)}</span>
                {active && (
                  <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13" className="lang-check" aria-hidden>
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
