'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { useLegalDocuments } from '@/lib/useLegal'
import LegalDocLink from '@/components/LegalDocLink'
import { IconShield, IconClose } from '@/components/icons'

// ─── Bandeau RGPD ─────────────────────────────────────────────────────────────
//
// Ce n'est pas un mur à cookies. Le site n'en dépose aucun à des fins
// publicitaires ou de mesure d'audience — il n'y a donc rien à autoriser, et
// une fenêtre bloquante ferait semblant de demander une permission dont
// personne n'a besoin. Ce bandeau informe, et se retire.
//
// Il se referme définitivement une fois lu, et ne revient que si le document
// auquel il renvoie change de version : c'est la seule raison honnête de
// redemander l'attention de quelqu'un qui a déjà dit avoir compris.
//
// Le texte, le titre et le document cible se règlent dans /admin/legal.

const KEY_PREFIX = 'cinepax_rgpd_notice'

export default function RgpdBanner() {
  const { t, lang } = useI18n()
  const pathname = usePathname()
  const { documents, settings } = useLegalDocuments()
  const [dismissed, setDismissed] = useState(true)   // fermé par défaut : pas de saut à l'hydratation
  const [leaving, setLeaving] = useState(false)

  const doc = documents.find(d => d.slug === settings?.banner_doc_slug)
  const storageKey = doc ? `${KEY_PREFIX}_${doc.slug}_v${doc.version}` : null

  useEffect(() => {
    if (!storageKey) return
    try { setDismissed(localStorage.getItem(storageKey) === '1') }
    catch { setDismissed(false) }   // navigation privée : le bandeau reparaîtra, tant pis
  }, [storageKey])

  function dismiss() {
    setLeaving(true)
    try { localStorage.setItem(storageKey, '1') } catch {}
    // Laisse la sortie se jouer avant de retirer le nœud ; la durée
    // correspond à .rgpd-banner.is-leaving dans globals.css.
    setTimeout(() => setDismissed(true), 240)
  }

  // L'administration a son propre cadre : y superposer le bandeau destiné
  // aux clients n'aurait pas de sens.
  if (pathname?.startsWith('/admin')) return null
  if (!settings?.banner_enabled || !doc || dismissed) return null

  const title = (lang === 'en' && settings.banner_title_en) || settings.banner_title_fr
  const text  = (lang === 'en' && settings.banner_text_en)  || settings.banner_text_fr

  return (
    <aside
      className={`rgpd-banner ${leaving ? 'is-leaving' : ''}`}
      role="region"
      aria-label={title}
    >
      <div className="rgpd-inner">
        <span className="rgpd-mark" aria-hidden="true"><IconShield size={19} /></span>

        <div className="rgpd-text">
          <p className="rgpd-title">{title}</p>
          <p className="rgpd-body">
            {text}{' '}
            <LegalDocLink slug={doc.slug} className="rgpd-more">
              {t('legal.bannerLearnMore')}
            </LegalDocLink>
          </p>
        </div>

        <button type="button" className="rgpd-ok" onClick={dismiss}>
          {t('legal.bannerAccept')}
        </button>

        <button
          type="button"
          className="rgpd-x"
          onClick={dismiss}
          aria-label={t('legal.bannerDismiss')}
        >
          <IconClose size={15} />
        </button>
      </div>
    </aside>
  )
}
