'use client'
import { useEffect } from 'react'
import { useI18n } from '@/lib/i18n'
import {
  ETAPES, PAIEMENT, PLACE,
  EN_COURS, FAITE, RATEE,
  etatsEtapes, travailEnCours,
} from '@/lib/etapesAchat'

// ─── Le talon d'achat ─────────────────────────────────────────────────────────
// Trois segments perforés, comme le billet qu'ils fabriquent : chacun se
// remplit quand son temps est acquis, celui en cours est parcouru d'un
// balayage. Le client sait où il en est et, surtout, qu'il reste quelque
// chose après le paiement.
//
// Cet indicateur ne fait qu'afficher. Il ne déclenche aucun appel, ne retient
// aucun état du parcours et ne s'intercale dans aucune décision : on peut le
// retirer sans rien changer au traitement.
//
// Seule exception, et elle est délibérée : pendant l'enregistrement de la
// place — le seul moment où fermer l'onglet coûte vraiment quelque chose au
// client — la garde `beforeunload` fait apparaître l'avertissement natif du
// navigateur. Jamais pendant le paiement : la banque rend la main par une
// redirection, et un dialogue posé là bloquerait le retour.

function Marqueur({ etat, rang }) {
  if (etat === FAITE) {
    return (
      <svg className="etape-glyphe" viewBox="0 0 14 14" fill="none" stroke="currentColor"
        strokeWidth="2.4" width="11" height="11" aria-hidden>
        <path d="M2.5 7.4L5.8 10.7L11.5 3.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (etat === RATEE) {
    return (
      <svg className="etape-glyphe" viewBox="0 0 14 14" fill="none" stroke="currentColor"
        strokeWidth="1.9" width="12" height="12" aria-hidden>
        <path d="M7 1.6l5.6 9.8H1.4L7 1.6z" strokeLinejoin="round" />
        <path d="M7 5.6v2.5M7 9.9h.01" strokeLinecap="round" />
      </svg>
    )
  }
  return <span className="etape-rang" aria-hidden>{String(rang).padStart(2, '0')}</span>
}

export default function EtapesAchat({ courante, veeziEtat = null, className = '' }) {
  const { t } = useI18n()
  const etats = etatsEtapes(courante, veeziEtat)
  const encours = travailEnCours(etats)

  // Le seul moment où un onglet fermé fait perdre la place. Voir l'en-tête.
  //
  // La garde est bornée dans le temps, et ce n'est pas une précaution de
  // principe : l'appel qu'elle couvre est un `fetch` sans délai d'expiration.
  // S'il reste suspendu — serveur qui ne répond jamais, réseau qui s'éteint
  // sans rompre — l'étape resterait « en cours » indéfiniment, et le client se
  // verrait refuser la sortie de la page à chaque tentative. Passé ce délai,
  // l'attente n'aboutira plus : le retenir ne lui rend plus service.
  const retenir = courante === PLACE && encours
  useEffect(() => {
    if (!retenir) return
    function garde(e) { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', garde)
    const relache = setTimeout(() => window.removeEventListener('beforeunload', garde), 20000)
    return () => {
      clearTimeout(relache)
      window.removeEventListener('beforeunload', garde)
    }
  }, [retenir])

  // La consigne se règle sur ce qui tourne : elle annonce la suite pendant le
  // paiement, elle retient pendant l'enregistrement, elle disparaît après.
  const consigne = !encours
    ? null
    : courante === PAIEMENT ? t('etapes.tenirPaiement') : t('etapes.tenirPlace')

  return (
    <div className={`etapes ${className}`.trim()}>
      <ol className="etapes-talon" aria-label={t('etapes.aria')}>
        {ETAPES.map((etape, i) => (
          <li
            key={etape}
            className={`etape etape--${etats[i]}`}
            aria-current={etats[i] === EN_COURS ? 'step' : undefined}
          >
            <span className="etape-jauge" aria-hidden />
            <span className="etape-ligne">
              <Marqueur etat={etats[i]} rang={i + 1} />
              <span className="etape-nom">{t(`etapes.${etape}`)}</span>
            </span>
            {/* L'état est porté à l'œil par la couleur du segment et par le
                glyphe. Il est dit en toutes lettres à qui ne les voit pas. */}
            <span className="etape-sr">{t(`etapes.etat.${etats[i]}`)}</span>
          </li>
        ))}
      </ol>

      {consigne && (
        <p className="etapes-consigne" role="status">
          <span className="etapes-pouls" aria-hidden />
          {consigne}
        </p>
      )}
    </div>
  )
}
