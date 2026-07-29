'use client'
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

// Bascule de langue FR/EN — segmented toggle avec indicateur coulissant.
// Chaque option porte son drapeau + son libellé ; l'indicateur glisse sur l'actif.
export default function LanguageSwitcher({ compact = false }) {
  const { lang, setLang, t } = useI18n()

  return (
    <div
      className={`lang-switch ${compact ? 'lang-switch--compact' : ''}`}
      role="group"
      aria-label={t('lang.label')}
    >
      <span className={`lang-switch-thumb lang-switch-thumb--${lang}`} aria-hidden />
      <button
        type="button"
        className={`lang-switch-opt ${lang === 'fr' ? 'active' : ''}`}
        onClick={() => setLang('fr')}
        aria-pressed={lang === 'fr'}
        aria-label={t('lang.fr')}
        lang="fr"
      >
        <span className="lang-flag"><FlagFR /></span>
        <span className="lang-switch-code">FR</span>
      </button>
      <button
        type="button"
        className={`lang-switch-opt ${lang === 'en' ? 'active' : ''}`}
        onClick={() => setLang('en')}
        aria-pressed={lang === 'en'}
        aria-label={t('lang.en')}
        lang="en"
      >
        <span className="lang-flag"><FlagEN /></span>
        <span className="lang-switch-code">EN</span>
      </button>
    </div>
  )
}
