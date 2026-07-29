'use client'

import { useI18n } from '@/lib/i18n'
import { TERMES } from '@/lib/contenu'

// ─── Termes et conditions ─────────────────────────────────────────────────────
// Recopiés mot pour mot de cinepax.mg. Aucun endpoint Veezi ou Connect
// n'expose de contenu éditorial — le texte vit dans le CMS de leur site.
// Le contenu est donc versionné avec le code, dans lib/contenu.js.

export default function TermesPage() {
  const { t } = useI18n()
  const [intro, ...sections] = TERMES

  return (
    <div className="page-container">
      <div className="section-header">
        <h1 className="section-title">{t('terms.title')}</h1>
      </div>
      <hr className="section-divider" />

      <div className="prose-page prose-page--narrow">
        {intro && (
          <>
            <h2 className="prose-subtitle prose-subtitle--first">{intro.heading}</h2>
            {intro.paragraphs.map((p, i) => <p key={i} className="prose-lead">{p}</p>)}
          </>
        )}

        {sections.map(section => (
          <section key={section.heading} className="terms-section">
            <h2 className="prose-subtitle">{section.heading}</h2>
            {section.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
          </section>
        ))}
      </div>
    </div>
  )
}
