// ─── Traduction des synopsis Veezi ────────────────────────────────────────────
// Module serveur uniquement : il porte la clé Gemini et la clé service_role
// Supabase. Ne jamais l'importer depuis un composant client.
//
// Le principe tient en une phrase : on ne traduit qu'en dernier recours, et
// jamais pendant que le visiteur attend.
//
//   1. `meilleurSynopsis` cherche le texte dans la bonne langue directement
//      dans Veezi — la fiche elle-même, ou sa fiche sœur VF/VO. Sur l'affiche
//      relevée le 5 août 2026, cela règle 11 films sur 14.
//   2. Ce qui reste est cherché dans `film_translations`, indexé sur
//      l'empreinte du texte source.
//   3. Ce qui manque encore est renvoyé tel quel au visiteur, et mis en file :
//      la traduction part en tâche de fond (`after()` côté route, ou le cron
//      quotidien) et sera là au prochain affichage.
//
// Conséquence : si la clé Gemini manque, expire, ou si le quota gratuit est
// atteint, le site continue d'afficher le texte Veezi d'origine. La traduction
// est un enrichissement, jamais une dépendance du tunnel d'achat.

import { createHash } from 'node:crypto'
import { createServiceClient } from '@/lib/supabase'
import { grouperParTitre, meilleurSynopsis } from '@/lib/langue'

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions'
const MODELE   = process.env.GEMINI_MODEL || 'gemini-3.6-flash'

// Délai de garde sur la lecture du cache : elle est sur le chemin de la
// réponse, donc du temps d'attente du visiteur. Une base lente ou injoignable
// doit coûter une traduction manquée, pas une page qui rame.
const LECTURE_CACHE_MS = 1500

// L'écriture, elle, se fait en tâche de fond : elle peut prendre son temps.
const ECRITURE_CACHE_MS = 8000

const NOMS = { fr: 'français', en: 'anglais' }

// La consigne porte tout ce qui distingue un synopsis d'un texte ordinaire.
// Les trois premières règles viennent de cas réels du catalogue, documentés
// dans lib/synopsis.jsx : la syntaxe des notes de presse (**gras**, *italique*),
// « Thunderbolts* » dont l'astérisque appartient au titre, et les pseudos
// Instagram du casting.
const CONSIGNE = `Tu traduis des synopsis de films pour le site d'un cinéma.
Rends UNIQUEMENT le texte traduit : pas d'introduction, pas de commentaire,
pas de guillemets autour du résultat.

Règles absolues :
- Conserve la mise en forme au caractère près : **gras**, *italique*, et les
  lignes vides qui séparent les paragraphes.
- Ne traduis JAMAIS un titre de film, même mis en italique. « Spider-Man: No
  Way Home » reste « Spider-Man: No Way Home ».
- Une astérisque collée à un mot fait partie du mot (« Thunderbolts* ») :
  ne la déplace pas, ne la supprime pas, n'en ajoute pas.
- Ne traduis ni les noms propres, ni les pseudonymes de réseaux sociaux
  (taleb_kant, guy_kalou_babiwood), ni les noms de studios.
- Garde le ton d'une note de presse de distributeur : présent de narration,
  pas de résumé personnel, pas d'ajout d'information.`

// ─── Empreinte ────────────────────────────────────────────────────────────────

// Clé de cache : le texte source lui-même. Les fiches VF, VO et 3D d'une même
// œuvre portent souvent le synopsis au caractère près et se partagent donc une
// seule traduction. Et si le distributeur corrige son texte dans Veezi,
// l'empreinte change : la traduction se régénère d'elle-même.
export function empreinte(texte) {
  return createHash('sha256').update(String(texte)).digest('hex')
}

// ─── Appel Gemini ─────────────────────────────────────────────────────────────

class QuotaAtteint extends Error {}

// Un modèle bavard ajoute parfois une phrase d'introduction malgré la consigne.
function nettoyer(sortie) {
  let t = String(sortie || '').trim()
  t = t.replace(/^(?:voici (?:la )?traduction|traduction|here(?:'s| is) the translation)\s*:?\s*/i, '')
  // Guillemets encadrant la totalité du texte, jamais présents dans un synopsis.
  if (/^["“«]/.test(t) && /["”»]$/.test(t)) t = t.slice(1, -1).trim()
  return t
}

// Garde-fou : une traduction beaucoup plus courte ou plus longue que la source
// n'est pas une traduction. Mieux vaut alors garder le texte d'origine.
function plausible(source, resultat) {
  if (!resultat) return false
  const r = resultat.length / source.length
  return r > 0.4 && r < 2.6
}

// Traduit un texte vers `cible`. Renvoie null si le moteur n'est pas
// configuré ou si le résultat n'est pas exploitable.
export async function traduire(texte, cible, { timeoutMs = 25000 } = {}) {
  const cle = process.env.GEMINI_API_KEY
  if (!cle || !texte) return null

  const stop = AbortSignal.timeout(timeoutMs)
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    signal: stop,
    headers: { 'x-goog-api-key': cle, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELE,
      system_instruction: CONSIGNE,
      input: `Traduis en ${NOMS[cible] || cible} le synopsis suivant :\n\n${texte}`,
      generation_config: { thinking_level: 'low' },
    }),
  })

  // 429 : quota par minute ou par jour atteint. On arrête le lot en cours
  // plutôt que d'insister — le reste attendra le prochain passage.
  if (res.status === 429) throw new QuotaAtteint('quota Gemini atteint')
  if (!res.ok) throw new Error(`Gemini ${res.status}`)

  const data = await res.json()
  const sortie = nettoyer(data?.output_text)
  return plausible(texte, sortie) ? sortie : null
}

// ─── Résolution ───────────────────────────────────────────────────────────────

// Rend le meilleur synopsis disponible immédiatement, sans aucun appel réseau
// de traduction, et signale ce qu'il reste à traduire.
//
//   catalogue   — le /v4/film complet, nécessaire pour trouver les fiches sœurs
//   filmsVises  — les fiches dont on veut le synopsis
//   cible       — 'fr' | 'en'
//
// Renvoie { synopsis: Map<id, { texte, langue, auto }>, enAttente: [...] }.
// `auto` marque une traduction automatique ; `langue` est celle du texte rendu,
// qui peut différer de `cible` tant que la traduction n'est pas prête.
export async function resoudreSynopsis(catalogue, filmsVises, cible) {
  const groupes  = grouperParTitre(catalogue)
  const synopsis = new Map()
  const files    = new Map()   // empreinte → { hash, texte, source, id, titre }
  const parId    = new Map()   // id de fiche → empreinte, pour les seules fiches à traduire

  for (const film of filmsVises || []) {
    const id = String(film?.Id ?? '')
    if (!id) continue

    const trouve = meilleurSynopsis(film, groupes, cible)
    if (!trouve) continue

    synopsis.set(id, { texte: trouve.texte, langue: trouve.langue, auto: false })

    // Déjà dans la bonne langue, ou langue indéterminée : on ne traduit pas.
    // Traduire un texte dont on ignore la langue reviendrait à parier.
    if (trouve.langue === cible || !trouve.langue) continue

    const hash = empreinte(trouve.texte)
    parId.set(id, hash)
    if (!files.has(hash)) {
      files.set(hash, { hash, texte: trouve.texte, source: trouve.langue, id, titre: film.Title })
    }
  }

  if (!files.size) return { synopsis, enAttente: [] }

  // Ce qui est déjà traduit en base. Le cache est un raccourci, pas une
  // dépendance : au-delà du délai de garde on rend le texte d'origine plutôt
  // que de faire attendre la page. Sans lui, une base injoignable bloque
  // l'affichage pendant toute la durée du timeout réseau.
  const sb = createServiceClient()
  if (sb) {
    const { data, error } = await sb
      .from('film_translations')
      .select('source_hash, body')
      .eq('lang', cible)
      .in('source_hash', [...files.keys()])
      .abortSignal(AbortSignal.timeout(LECTURE_CACHE_MS))

    if (!error) {
      const parHash = new Map((data || []).map(r => [r.source_hash, r.body]))
      for (const [id, hash] of parId) {
        const traduit = parHash.get(hash)
        if (traduit) synopsis.set(id, { texte: traduit, langue: cible, auto: true })
      }
      for (const hash of parHash.keys()) files.delete(hash)
    }
  }

  return { synopsis, enAttente: [...files.values()] }
}

// ─── Traduction en tâche de fond ──────────────────────────────────────────────

const pause = ms => new Promise(r => setTimeout(r, ms))

// Traductions en cours dans ce processus. Sans ce garde, dix visiteurs arrivant
// ensemble sur un film qui vient de sortir déclencheraient dix fois la même
// traduction : autant de quota gratuit brûlé pour un seul texte. Le premier la
// fait, les autres passent leur tour — et la trouveront en cache juste après.
const enCoursDeTraduction = new Set()

// Traite la file renvoyée par `resoudreSynopsis` et écrit le résultat en base.
// Appelée hors du chemin de réponse : depuis `after()` dans une route, ou
// depuis le cron quotidien. Bornée en nombre et espacée dans le temps, pour
// rester sous la limite par minute du palier gratuit Gemini.
export async function traduireLot(enAttente, cible, { max = 6, delaiMs = 5000 } = {}) {
  if (!process.env.GEMINI_API_KEY) return { traduits: 0, echecs: 0, restants: enAttente.length }

  const sb = createServiceClient()
  const lot = enAttente
    .filter(item => !enCoursDeTraduction.has(`${cible}:${item.hash}`))
    .slice(0, max)
  let traduits = 0
  let echecs   = 0

  for (const [i, item] of lot.entries()) {
    const jeton = `${cible}:${item.hash}`
    if (enCoursDeTraduction.has(jeton)) continue
    enCoursDeTraduction.add(jeton)
    try {
      if (i > 0) await pause(delaiMs)
      const texte = await traduire(item.texte, cible)
      if (!texte) { echecs++; continue }

      if (sb) {
        const { error } = await sb.from('film_translations').upsert({
          source_hash: item.hash,
          lang:        cible,
          source_lang: item.source,
          body:        texte,
          film_id:     item.id,
          film_title:  item.titre || null,
          engine:      MODELE,
        }, { onConflict: 'source_hash,lang', ignoreDuplicates: false })
          .abortSignal(AbortSignal.timeout(ECRITURE_CACHE_MS))
        if (error) { echecs++; continue }
      }
      traduits++
    } catch (err) {
      echecs++
      // Quota atteint : inutile d'enchaîner, tout le lot échouerait de même.
      if (err instanceof QuotaAtteint) break
    } finally {
      // Le jeton ne tient que le temps de l'appel : une fois la traduction en
      // base, c'est le cache qui empêche le doublon.
      enCoursDeTraduction.delete(jeton)
    }
  }

  return { traduits, echecs, restants: Math.max(0, enAttente.length - lot.length) }
}
