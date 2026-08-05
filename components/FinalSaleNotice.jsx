'use client'
import { useI18n } from '@/lib/i18n'

// ─── Voyant d'achat définitif ─────────────────────────────────────────────────
// « Achat définitif : billet non échangeable et non remboursable. »
//
// La même phrase, au même endroit du regard, partout où le client engage ou
// consulte son achat. Le bandeau AchatBand annonce la nature de la vente en
// tête d'écran ; ce voyant-ci se pose au ras de la décision — juste au-dessus
// du bouton qui engage, juste sous le billet qui en résulte.
//
// `when="before"` : le client n'a pas encore payé, la phrase se met au futur.
// `tone="quiet"`  : mention de rappel, sur un écran où l'achat est déjà fait.
export default function FinalSaleNotice({ when = 'after', tone = 'default', className = '' }) {
  const { t } = useI18n()
  const text = when === 'before' ? t('achat.finalSaleBefore') : t('achat.finalSale')

  return (
    <p className={`final-sale final-sale--${tone} ${className}`.trim()} role="note">
      <svg
        className="final-sale-icon"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        width="14"
        height="14"
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r="7.6" />
        <path d="M10 6.2v4.6" strokeLinecap="round" />
        <path d="M10 13.6h.01" strokeLinecap="round" />
      </svg>
      <span className="final-sale-text">{text}</span>
    </p>
  )
}
