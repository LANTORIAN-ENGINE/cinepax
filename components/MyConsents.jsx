'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { legalPath } from '@/lib/legal'
import { IconCheck, IconAlert, IconArrowRight } from '@/components/icons'

// ─── Mes consentements ────────────────────────────────────────────────────────
//
// Le règlement donne un droit d'accès ; ce panneau le rend utilisable sans
// écrire un courrier. Chacun voit ce qu'il a accepté, dans quelle version et
// à quelle date — et peut relire exactement ce texte-là, même si le document
// a changé depuis : le lien porte le numéro de version acceptée.
//
// Un document mis à jour depuis l'acceptation est signalé comme tel, avec le
// chemin pour se remettre à jour. Il n'y a pas de bouton « retirer » ici :
// un retrait de consentement ferme l'accès au compte, ce qui se demande à
// l'équipe et se traite avec elle, pas d'un clic dans un tableau.

export default function MyConsents() {
  const { t, locale } = useI18n()
  const [state, setState] = useState({ consents: [], documents: [], pending: [], loading: true })

  useEffect(() => {
    const supabase = createClient()
    if (!supabase) { setState(s => ({ ...s, loading: false })); return }

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.access_token) { setState(s => ({ ...s, loading: false })); return }
      try {
        const res  = await fetch('/api/legal/consent', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const data = await res.json()
        setState({
          consents:  data.consents || [],
          documents: data.documents || [],
          pending:   data.pending || [],
          loading:   false,
        })
      } catch {
        setState(s => ({ ...s, loading: false }))
      }
    })
  }, [])

  if (state.loading) {
    return (
      <div className="compte-profile-card" aria-busy="true">
        <h2>{t('legal.myConsents')}</h2>
        <span className="legal-sk" style={{ width: '100%', height: 44 }} />
        <span className="legal-sk" style={{ width: '100%', height: 44 }} />
      </div>
    )
  }

  // Le dernier geste par document : c'est lui qui décrit l'état courant.
  const latest = new Map()
  for (const c of state.consents) {
    const prev = latest.get(c.slug)
    if (!prev || new Date(c.accepted_at) > new Date(prev.accepted_at)) latest.set(c.slug, c)
  }

  const rows = state.documents.filter(d => d.requires_consent || latest.has(d.slug))

  return (
    <div className="compte-profile-card">
      <h2>{t('legal.myConsents')}</h2>
      <p className="mycon-lead">{t('legal.myConsentsLead')}</p>

      {rows.length === 0 ? (
        <p className="mycon-empty">{t('legal.consentEmpty')}</p>
      ) : (
        <ul className="mycon-list">
          {rows.map(doc => {
            const consent = latest.get(doc.slug)
            const current = consent?.accepted === true && consent.version === doc.version
            const title   = (locale.startsWith('en') && doc.title_en) || doc.title_fr

            // Relire ce qui a été accepté, pas ce qui est en vigueur —
            // sauf si c'est la même version, auquel cas le lien est direct.
            const href = consent && !current
              ? `${legalPath(doc.slug)}?version=${consent.version}`
              : legalPath(doc.slug)

            return (
              <li key={doc.slug} className={`mycon-row ${current ? 'is-current' : 'is-stale'}`}>
                <span className="mycon-state" aria-hidden="true">
                  {current ? <IconCheck size={14} /> : <IconAlert size={14} />}
                </span>

                <span className="mycon-main">
                  <Link href={href} className="mycon-title">{title}</Link>
                  <span className="mycon-meta">
                    {consent
                      ? `${t('legal.version', { n: consent.version })} · ${t('legal.consentGiven', {
                          date: new Date(consent.accepted_at).toLocaleDateString(locale, {
                            day: 'numeric', month: 'long', year: 'numeric',
                          }),
                        })}`
                      : t('legal.consentNever')}
                  </span>
                </span>

                <span className={`mycon-chip ${current ? 'is-ok' : 'is-warn'}`}>
                  {current ? t('legal.consentCurrent') : t('legal.consentOutdated')}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      {state.pending.length > 0 && (
        <p className="mycon-pending">
          {t('legal.consentOutdated')}
          <Link href="/legal" className="mycon-pending-cta">
            {t('legal.consentReview')}
            <IconArrowRight size={13} />
          </Link>
        </p>
      )}
    </div>
  )
}
