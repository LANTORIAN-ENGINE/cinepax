// ─── Langue et parenté des fiches Veezi ───────────────────────────────────────
// Veezi ne stocke qu'un synopsis par fiche, dans la langue où le distributeur
// l'a saisi. Sur le catalogue relevé le 5 août 2026 (2 371 fiches renseignées),
// 1 606 textes sont en français et 757 en anglais — y compris sur des fiches VF.
// Rien dans la réponse de l'API ne dit laquelle : il faut le deviner.
//
// Deux fonctions suffisent à couvrir plus d'un tiers du besoin sans traduire
// quoi que ce soit :
//
//   • deviner la langue d'un texte (`langueDe`) ;
//   • rapprocher les fiches d'une même œuvre (`titreDeBase`), parce que la VO
//     porte très souvent le texte anglais quand la VF porte le français. Sur
//     1 097 œuvres, 402 ont ainsi déjà leurs deux langues dans Veezi.

// ─── Détection de langue ──────────────────────────────────────────────────────

// Mots-outils sans ambiguïté entre les deux langues. Volontairement courte :
// on cherche un écart net sur un texte de 400 caractères, pas une classification
// fine. « son » et « a », communs aux deux langues, sont écartés.
const MOTS_FR = /\b(?:les?|des?|une?|dans|qui|que|pour|est|sont|avec|ses|leur|elle|aux?|sur|par|mais|tout|plus|ans|sa|au)\b/gi
const MOTS_EN = /\b(?:the|and|of|to|his|her|their|with|when|from|that|this|for|but|who|into|after|about|will|they|has)\b/gi

// L'élision est un marqueur français que l'anglais ne produit jamais :
// « l'océan », « d'enfance », « qu'il ». Elle départage les textes courts.
const ELISION_FR = /\b(?:[ldjnmtscq]|qu|jusqu|lorsqu|puisqu)['’](?=[a-zàâäéèêëîïôöùûüç])/gi

// Écart minimal pour trancher : en deçà, on préfère ne pas savoir plutôt que
// de traduire un texte dans la langue où il est déjà.
const MARGE = 1.25

function compte(texte, motif) {
  return (texte.match(motif) || []).length
}

// Renvoie 'fr', 'en', ou null si le texte est trop court ou trop ambigu.
export function langueDe(texte) {
  if (!texte) return null
  const t = String(texte)

  const fr = compte(t, MOTS_FR) + compte(t, ELISION_FR) * 2
  const en = compte(t, MOTS_EN)

  if (fr === 0 && en === 0) return null
  if (fr > en * MARGE) return 'fr'
  if (en > fr * MARGE) return 'en'
  return null
}

// ─── Parenté des fiches ───────────────────────────────────────────────────────

// Suffixes de version : une même œuvre existe en VF, VO, 3D, parfois les deux.
const VERSIONS = /\b(?:3D|2D|IMAX|4DX|VF|VO|VOST(?:FR)?|SOUS-TITR\S*)\b/gi

// Titre débarrassé de sa version, de ses accents et de sa ponctuation, pour
// regrouper les fiches d'une même œuvre. Sans le repli des accents,
// « L'ODYSSEE VF » et « L'ODYSSÉE VO » resteraient deux œuvres distinctes —
// et l'on traduirait un texte qui existe déjà dans la fiche sœur.
export function titreDeBase(titre = '') {
  return String(titre)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(VERSIONS, ' ')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .toUpperCase()
}

// Synopsis d'une fiche, quel que soit le champ qui le porte.
export function synopsisDe(film) {
  return (film?.Synopsis || film?.ShortSynopsis || '').trim()
}

// Indexe un catalogue Veezi par titre de base.
export function grouperParTitre(films) {
  const groupes = new Map()
  for (const film of films || []) {
    const cle = titreDeBase(film.Title)
    if (!cle) continue
    const liste = groupes.get(cle)
    if (liste) liste.push(film)
    else groupes.set(cle, [film])
  }
  return groupes
}

// ─── Choix du texte à afficher ────────────────────────────────────────────────

// Deux œuvres distinctes peuvent porter le même titre — une reprise, un
// remake. Avant d'emprunter le synopsis d'une fiche sœur, on vérifie qu'il
// s'agit bien de la même œuvre : même date de sortie et même durée, quand
// Veezi les renseigne. Un champ absent ne disqualifie pas — beaucoup de fiches
// anciennes sont incomplètes, et le titre reste alors le seul lien.
function memeOeuvre(a, b) {
  if (a?.OpeningDate && b?.OpeningDate && a.OpeningDate !== b.OpeningDate) return false
  const da = Number(a?.Duration)
  const db = Number(b?.Duration)
  if (Number.isFinite(da) && Number.isFinite(db) && da > 0 && db > 0) {
    if (Math.abs(da - db) > 2) return false
  }
  return true
}

// Cherche, pour une fiche donnée, le meilleur synopsis disponible dans `cible`
// sans rien traduire :
//
//   1. son propre texte, s'il est déjà dans la bonne langue ;
//   2. celui d'une fiche sœur (VF/VO/3D de la même œuvre) qui l'est ;
//   3. à défaut, son propre texte avec la langue devinée — c'est ce qu'il
//      faudra traduire.
//
// Renvoie { texte, langue, source } où `source` vaut 'fiche' | 'soeur',
// ou null si l'œuvre n'a aucun synopsis exploitable.
export function meilleurSynopsis(film, groupes, cible) {
  const propre = synopsisDe(film)
  const langueP = langueDe(propre)

  if (propre && langueP === cible) {
    return { texte: propre, langue: cible, source: 'fiche' }
  }

  const candidats = []
  for (const soeur of groupes?.get(titreDeBase(film?.Title)) || []) {
    if (String(soeur.Id) === String(film?.Id)) continue
    if (!memeOeuvre(film, soeur)) continue
    const texte = synopsisDe(soeur)
    if (texte && langueDe(texte) === cible) candidats.push(texte)
  }

  if (candidats.length) {
    // Plusieurs fiches sœurs peuvent proposer un texte dans la bonne langue,
    // et elles ne disent pas toujours la même chose : sur « L'ODYSSÉE », une
    // fiche du catalogue porte le synopsis d'un autre film que ses sœurs.
    // La traduction d'un texte fait à peu près sa longueur : on retient donc
    // la candidate la plus proche en taille. Sans texte propre pour comparer,
    // la plus fournie l'emporte.
    const choisi = propre
      ? candidats.reduce((a, b) =>
          Math.abs(Math.log(b.length / propre.length)) < Math.abs(Math.log(a.length / propre.length)) ? b : a)
      : candidats.reduce((a, b) => (b.length > a.length ? b : a))
    return { texte: choisi, langue: cible, source: 'soeur' }
  }

  if (!propre) return null
  return { texte: propre, langue: langueP, source: 'fiche' }
}
