'use client'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n'
import { useLegalDocuments } from '@/lib/useLegal'
import { legalPath } from '@/lib/legal'
import { IconArrowRight, IconShield, IconMail } from '@/components/icons'

// ─── Sommaire des documents légaux ────────────────────────────────────────────
//
// Quatre contrats alignés se ressemblent tous. Chaque carte annonce donc ce
// qu'on va lire — une phrase, écrite pour être comprise avant le clic — et
// ce que la lecture coûte : le numéro de version et la date d'entrée en
// vigueur. Un document daté se cite ; un document sans date ne se conteste
// pas.
//
// La souche découpée à gauche de chaque carte reprend le motif du billet :
// c'est le même geste que le plan du guichet dans le tunnel d'achat.
//
// L'ouverture (.ed-head) et la bande sombre de pied sont celles de la page
// « À propos » : ce sont les deux seules pages du site qu'on lit au lieu
// d'acheter, et elles doivent se reconnaître comme telles.

export default function LegalHubPage() {
  const { t, locale } = useI18n()
  const { documents, loading } = useLegalDocuments()

  return (
    <div className="page-container ed-page">
      <header className="ed-head">
        <p className="ed-eyebrow">{t('legal.hubEyebrow')}</p>
        <h1 className="ed-title">{t('legal.hubTitle')}</h1>
        <p className="ed-lead">{t('legal.hubLead')}</p>
      </header>
      <hr className="ed-rule" />

      {loading ? (
        <ul className="legal-hub-grid" aria-busy="true">
          {[0, 1, 2, 3].map(i => (
            <li key={i} className="legal-card legal-card--sk" style={{ '--sk-delay': `${i * 0.07}s` }}>
              <span className="legal-sk" style={{ width: '38%', height: 10 }} />
              <span className="legal-sk" style={{ width: '72%', height: 17 }} />
              <span className="legal-sk" style={{ width: '100%', height: 11 }} />
              <span className="legal-sk" style={{ width: '54%', height: 11 }} />
            </li>
          ))}
        </ul>
      ) : documents.length === 0 ? (
        <p className="legal-empty">{t('legal.hubEmpty')}</p>
      ) : (
        <ul className="legal-hub-grid">
          {documents.map(doc => (
            <li key={doc.slug}>
              <Link href={legalPath(doc.slug)} className="legal-card">
                <span className="legal-card-stub" aria-hidden="true" />

                <span className="legal-card-main">
                  <span className="legal-card-meta">
                    <span className="legal-card-version">{t('legal.version', { n: doc.version })}</span>
                    {doc.requiresConsent && (
                      <span className="legal-card-flag">
                        <IconShield size={12} />
                        {t('legal.consentBadge')}
                      </span>
                    )}
                  </span>

                  <span className="legal-card-title">{doc.title}</span>
                  {doc.summary && <span className="legal-card-summary">{doc.summary}</span>}

                  <span className="legal-card-foot">
                    {doc.effectiveOn && (
                      <span className="legal-card-date">
                        {t('legal.effective', {
                          date: new Date(doc.effectiveOn).toLocaleDateString(locale, {
                            day: 'numeric', month: 'long', year: 'numeric',
                          }),
                        })}
                      </span>
                    )}
                    <span className="legal-card-go">
                      {t('legal.openDoc')}
                      <IconArrowRight size={14} />
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <section className="legal-hub-contact">
        <span className="legal-hub-contact-mark" aria-hidden="true"><IconMail size={20} /></span>
        <div>
          <h2 className="legal-hub-contact-title">{t('legal.hubContactTitle')}</h2>
          <p className="legal-hub-contact-lead">{t('legal.hubContactLead')}</p>
        </div>
        <Link href="/contact" className="legal-hub-contact-cta">
          {t('legal.hubContactCta')}
          <IconArrowRight size={14} />
        </Link>
      </section>
    </div>
  )
}
