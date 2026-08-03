'use client'
import { useI18n } from '@/lib/i18n'

// Bandeau « ACHAT | TICKET EN LIGNE ».
//
// La vente Cinepax est un achat ferme et définitif, pas une réservation. Le
// bandeau reprend la forme d'un talon de billet : la perforation tombe pile
// entre ACHAT et TICKET EN LIGNE, ce qui isole le mot qui doit être lu en
// premier. Il est posé aux trois points d'engagement du tunnel — liste des
// séances, choix des sièges, paiement.
//
// `size="sm"` : version compacte, pour les colonnes étroites (formulaire de
// paiement) où la note d'une ligne suffit.
export default function AchatBand({ size = 'md', className = '' }) {
  const { t } = useI18n()

  return (
    <aside className={`achat-band achat-band--${size} ${className}`.trim()} role="note">
      <span className="achat-band-stub">{t('achat.word')}</span>
      <span className="achat-band-perf" aria-hidden="true" />
      <span className="achat-band-body">
        <span className="achat-band-rest">{t('achat.rest')}</span>
        <span className="achat-band-note">{t('achat.note')}</span>
      </span>
    </aside>
  )
}
