'use client'

import { useI18n } from '@/lib/i18n'

// ─── Le schéma de carte ───────────────────────────────────────────────────────
//
// Où est le cryptogramme ? La réponse tient en une image et en aucune phrase :
// c'est un endroit physique sur un objet, au dos et à droite de la bande de
// signature. Le tracé reprend les encres du site — papier, filet, un rouge pour
// la zone désignée — et rien d'autre : ce n'est pas une illustration de carte,
// c'est une flèche.
//
// Il vit dans son propre fichier parce que deux lecteurs s'en servent : la
// bulle d'aide (`components/Aide.jsx`) et le guide (`components/GuideContenu`),
// que la bulle ouvre en modal. Le laisser dans Aide.jsx fermerait le cercle
// Aide → GuideModal → GuideContenu → Aide.
export default function AideCarte({ face = 'dos' }) {
  const { t } = useI18n()
  const legende = face === 'dos' ? t('aide.carteDos') : t('aide.carteRecto')

  return (
    <figure className="aide-schema">
      <svg viewBox="0 0 208 132" width="100%" role="img" aria-label={legende}>
        <rect x="4" y="4" width="200" height="124" rx="12"
              fill="var(--t-paper)" stroke="var(--t-line)" strokeWidth="1.5" />

        {face === 'dos' ? (
          <>
            {/* Bande magnétique */}
            <rect x="4" y="22" width="200" height="26" fill="var(--t-ink)" opacity="0.82" />
            {/* Bande de signature + zone du cryptogramme */}
            <rect x="20" y="66" width="112" height="24" rx="3"
                  fill="#fff" stroke="var(--t-line)" strokeWidth="1.5" />
            <rect x="136" y="66" width="46" height="24" rx="3"
                  fill="var(--t-red-w)" stroke="var(--t-red)" strokeWidth="2" />
            <g fill="var(--t-red-ink)" fontSize="13" fontWeight="700"
               fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
              <text x="159" y="83" textAnchor="middle">123</text>
            </g>
            {/* Le trait qui désigne — il s'arrête sous la bande magnétique,
                sinon le point se perd sur le noir. */}
            <path d="M159 62V56" stroke="var(--t-red)" strokeWidth="2" strokeLinecap="round" />
            <circle cx="159" cy="53.5" r="2.6" fill="var(--t-red)" />
          </>
        ) : (
          <>
            {/* Puce */}
            <rect x="22" y="34" width="30" height="23" rx="4"
                  fill="none" stroke="var(--t-ink-3)" strokeWidth="1.5" />
            <path d="M22 45h30M37 34v23" stroke="var(--t-ink-3)" strokeWidth="1.2" />
            {/* Numéro : quatre groupes de quatre */}
            <g fill="var(--t-ink-2)">
              {[0, 1, 2, 3].map(g => (
                [0, 1, 2, 3].map(c => (
                  <circle key={`${g}-${c}`} cx={26 + g * 44 + c * 9} cy="80" r="3" />
                ))
              ))}
            </g>
            <path d="M20 92h168" stroke="var(--t-red)" strokeWidth="2" strokeLinecap="round" />
            <rect x="20" y="102" width="42" height="14" rx="2"
                  fill="var(--t-red-w)" stroke="var(--t-red)" strokeWidth="1.5" />
            <text x="41" y="112.5" textAnchor="middle" fontSize="9" fontWeight="700"
                  fill="var(--t-red-ink)" fontFamily="ui-monospace, Menlo, monospace">MM/AA</text>
          </>
        )}
      </svg>
      <figcaption className="aide-schema-legende">{legende}</figcaption>
    </figure>
  )
}
