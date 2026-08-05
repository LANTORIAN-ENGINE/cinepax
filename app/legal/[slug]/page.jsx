'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { useLegalDocument, useLegalDocuments } from '@/lib/useLegal'
import {
  sanitizeLegalHtml, anchorHeadings, extractHeadings,
  readingMinutes, legalPath,
} from '@/lib/legal'
import { IconArrowRight, IconShield, IconAlert, IconPrinter, IconDoc } from '@/components/icons'

// ─── Un document légal, en pleine page ────────────────────────────────────────
//
// Deux choses manquent d'ordinaire à ces pages : savoir où l'on est dans un
// texte long, et savoir de quand il date. Le sommaire répond à la première —
// il suit la lecture et se cale à l'article en cours. Le filet de progression
// sous l'en-tête répond à la même question d'un coup d'œil, et reprend le
// motif de la souche du modal de consentement : le même geste, à deux
// échelles. La date et le numéro de version répondent à la seconde, en tête.
//
// Une version archivée reste consultable : c'est peut-être celle que le
// lecteur a acceptée. La page le dit alors franchement, plutôt que de la
// présenter comme la règle du jour.

export default function LegalDocPage() {
  const { slug } = useParams()
  const { t, locale } = useI18n()

  // ?version=2 lu à la main : useSearchParams imposerait une frontière
  // Suspense sans rien apporter ici, la page étant déjà client.
  const [version, setVersion] = useState(null)
  useEffect(() => {
    const v = Number(new URLSearchParams(window.location.search).get('version'))
    setVersion(Number.isInteger(v) && v > 0 ? v : null)
  }, [slug])

  const { document: doc, raw, loading, error } = useLegalDocument(slug, version)
  const { documents } = useLegalDocuments()

  const [progress, setProgress] = useState(0)
  const [active, setActive] = useState(null)
  const articleRef = useRef(null)

  const html = useMemo(
    () => anchorHeadings(sanitizeLegalHtml(doc?.body || '')),
    [doc?.body]
  )
  const headings = useMemo(() => extractHeadings(html), [html])

  // Progression de lecture et article courant. Une seule passe au défilement,
  // et rien tant que le texte n'est pas là.
  useEffect(() => {
    const article = articleRef.current
    if (!article) return

    function onScroll() {
      const rect  = article.getBoundingClientRect()
      const total = rect.height - window.innerHeight
      const done  = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 1
      setProgress(Math.round(done * 100))

      // L'article courant est le dernier dont le titre a dépassé le tiers
      // haut de l'écran : le titre que l'on vient de franchir, pas celui
      // vers lequel on va.
      const marks = article.querySelectorAll('h2[id]')
      let current = null
      for (const mark of marks) {
        if (mark.getBoundingClientRect().top <= window.innerHeight * 0.33) current = mark.id
        else break
      }
      setActive(current)
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [html])

  if (loading) {
    return (
      <div className="page-container">
        <div className="legal-doc-sk" aria-busy="true">
          <span className="legal-sk" style={{ width: 140, height: 11 }} />
          <span className="legal-sk" style={{ width: '62%', height: 30 }} />
          <span className="legal-sk" style={{ width: '40%', height: 12 }} />
          <span className="legal-sk legal-sk--gap" style={{ width: '100%', height: 11 }} />
          <span className="legal-sk" style={{ width: '96%', height: 11 }} />
          <span className="legal-sk" style={{ width: '88%', height: 11 }} />
          <span className="legal-sk" style={{ width: '93%', height: 11 }} />
        </div>
      </div>
    )
  }

  if (error || !doc) {
    const missing = error === 'not_found' || error === 'version_not_found'
    return (
      <div className="page-container">
        <div className="legal-missing">
          <span className="legal-missing-mark" aria-hidden="true"><IconAlert size={22} /></span>
          <h1 className="legal-missing-title">{missing ? t('legal.notFound') : t('legal.loadError')}</h1>
          <p className="legal-missing-lead">{missing ? t('legal.notFoundLead') : ''}</p>

          {documents.length > 0 && (
            <ul className="legal-missing-list">
              {documents.map(d => (
                <li key={d.slug}>
                  <Link href={legalPath(d.slug)}>
                    <IconDoc size={15} />
                    {d.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <Link href="/legal" className="legal-back">
            {t('legal.backToHub')}
            <IconArrowRight size={14} />
          </Link>
        </div>
      </div>
    )
  }

  const fmtDate = value =>
    value ? new Date(value).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) : null

  return (
    <div className="page-container legal-doc-page">
      <header className="legal-doc-head">
        <Link href="/legal" className="legal-crumb">
          <IconDoc size={13} />
          {t('legal.hubTitle')}
        </Link>

        <h1 className="legal-doc-title">{doc.title}</h1>
        {doc.summary && <p className="legal-doc-lead">{doc.summary}</p>}

        <p className="legal-doc-meta">
          <span className="legal-doc-version">{t('legal.version', { n: doc.version })}</span>
          {doc.effectiveOn && <span>{t('legal.effective', { date: fmtDate(doc.effectiveOn) })}</span>}
          <span>{t('legal.readingTime', { n: readingMinutes(doc.body) })}</span>
          {doc.requiresConsent && (
            <span className="legal-doc-flag">
              <IconShield size={13} />
              {t('legal.consentBadge')}
            </span>
          )}
        </p>

        <button type="button" className="legal-print" onClick={() => window.print()}>
          <IconPrinter size={15} />
          {t('legal.print')}
        </button>

        {/* Le filet suit la lecture. Il double le sommaire pour qui ne
            l'ouvre pas — et il est la seule chose visible sur mobile,
            où le sommaire passe en accordéon. */}
        <div className="legal-progress" aria-hidden="true">
          <span className="legal-progress-fill" style={{ '--legal-read': `${progress}%` }} />
        </div>
      </header>

      {raw?.is_archived && (
        <div className="legal-archived" role="status">
          <span className="legal-archived-mark" aria-hidden="true"><IconAlert size={17} /></span>
          <div>
            <p className="legal-archived-title">{t('legal.archivedTitle')}</p>
            <p className="legal-archived-lead">{t('legal.archivedLead', { n: doc.version })}</p>
          </div>
          <Link href={legalPath(doc.slug)} className="legal-archived-cta">
            {t('legal.archivedCta')}
            <IconArrowRight size={13} />
          </Link>
        </div>
      )}

      {doc.fallbackLang && (
        <p className="legal-fallback" role="status">{t('legal.translationMissing')}</p>
      )}

      <div className="legal-doc-body">
        {headings.length > 2 && (
          <nav className="legal-toc" aria-label={t('legal.contents')}>
            <p className="legal-toc-title">{t('legal.contents')}</p>
            <ol className="legal-toc-list">
              {headings.map((h, i) => (
                <li key={h.id}>
                  <a href={`#${h.id}`} className={active === h.id ? 'is-active' : ''}>
                    <span className="legal-toc-num">{String(i + 1).padStart(2, '0')}</span>
                    <span className="legal-toc-label">{h.label}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <article
          className="legal-prose legal-prose--page"
          ref={articleRef}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>

      <footer className="legal-doc-foot">
        {doc.updatedAt && (
          <p className="legal-doc-updated">{t('legal.updated', { date: fmtDate(doc.updatedAt) })}</p>
        )}
        <Link href="/legal" className="legal-back">
          {t('legal.backToHub')}
          <IconArrowRight size={14} />
        </Link>
      </footer>
    </div>
  )
}
