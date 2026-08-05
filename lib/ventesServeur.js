import { createServiceClient } from '@/lib/supabase'
import { DEFAULTS, readSettings, isSaleOpen, saleClosesAt } from '@/lib/ventes'
import { sessionsVeezi, debutSeance } from '@/lib/veeziCatalogue'

// Lecture serveur des réglages de vente (table sales_settings).
//
// Trois routes s'en servent à chaque appel — la route publique, la création
// d'achat et la réservation Veezi. Le réglage tient en deux champs et ne
// change qu'à la main : on le garde trente secondes en mémoire du processus
// plutôt que d'ouvrir une connexion par requête. Une modification faite
// dans l'administration est donc appliquée dans la demi-minute, partout.
//
// Sans Supabase, ou si la base ne répond pas, on retombe sur les valeurs par
// défaut (délai nul) : une panne de base ne doit pas fermer la billetterie
// d'elle-même. Voir CUTOFF_FALLBACK dans lib/ventes.js.

const TTL_MS = 30_000

let memo = null   // { at, settings }

export async function reglagesVente() {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.settings

  const supabase = createServiceClient()
  if (!supabase) return { ...DEFAULTS }

  try {
    const { data, error } = await supabase
      .from('sales_settings')
      .select('cutoff_minutes, hide_in_programme')
      .eq('id', 1)
      .maybeSingle()

    // Table pas encore créée (migration non passée) : valeurs par défaut,
    // sans mémoriser — la migration doit prendre effet dès qu'elle passe.
    if (error) return { ...DEFAULTS }

    const settings = readSettings(data)
    memo = { at: Date.now(), settings }
    return settings
  } catch {
    return memo?.settings || { ...DEFAULTS }
  }
}

// À appeler après une écriture dans l'administration : la vérification
// serveur qui suit doit voir le nouveau délai, pas celui d'il y a vingt
// secondes.
export function oublierReglagesVente() {
  memo = null
}

// ─── Contrôle à l'écriture ────────────────────────────────────────────────────
// Le tunnel filtre les séances refermées, mais un filtrage côté client ne
// prouve rien : un onglet resté ouvert depuis une heure, un lien profond
// rejoué, une requête forgée. La création d'achat repasse donc par ici.
//
// C'est le seul point de contrôle, et il est placé avant le paiement.
// /api/veezi/reserve, qui court après l'encaissement, ne revérifie rien :
// refuser la place d'un client qui vient de payer parce que le délai est
// tombé entre-temps le laisserait sans billet et sans argent.
//
// L'horaire de référence est celui de Veezi, pas celui envoyé par le
// client : c'est la seule valeur qu'on n'a pas à croire sur parole. La
// liste /v1/session pèse 84 Ko et sort du cache de Next la plupart du
// temps ; l'horaire d'une séance ne bouge pas de toute façon.
//
// Renvoie { open, cutoffMinutes, closesAt, start }. `open` vaut vrai quand
// rien ne s'oppose à la vente — y compris lorsqu'aucun horaire n'a pu être
// établi : on ne refuse un achat que sur une certitude.
export async function venteOuverte({ sessionId, sessionTime }) {
  const { cutoffMinutes } = await reglagesVente()
  if (!cutoffMinutes) {
    return { open: true, cutoffMinutes: 0, closesAt: null, start: sessionTime || null }
  }

  let start = null
  try {
    const sessions = await sessionsVeezi()
    const found = (sessions || []).find(s => String(s.Id) === String(sessionId))
    if (found) start = debutSeance(found)
  } catch {
    // Veezi injoignable — on retombe sur l'horaire annoncé par le client.
    // Il peut être falsifié, mais le seul risque est de laisser passer un
    // achat tardif ; refuser toutes les ventes parce qu'une API tousse
    // serait pire.
  }
  if (!start) start = sessionTime || null
  if (!start) return { open: true, cutoffMinutes, closesAt: null, start: null }

  return {
    open:     isSaleOpen(start, cutoffMinutes),
    cutoffMinutes,
    closesAt: saleClosesAt(start, cutoffMinutes),
    start,
  }
}
