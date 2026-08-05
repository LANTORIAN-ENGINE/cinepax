// ─── Classification des films ─────────────────────────────────────────────────
// Veezi renvoie le champ `Rating` tel qu'il a été saisi, distributeur par
// distributeur. Sur le catalogue Cinepax (2 412 films relevés) cela donne
// vingt-quatre écritures pour une dizaine de sens réels :
//
//   TBC (430)   INT - 12 (197)   15 (98)   12A (55)   INT - 16 (53)   TP (40)
//   AVT (26)    PG (20)          U (16)    12 ANS (7)  18 (7)         INT - 15 (5)
//   12 (4)      PG-13 (3)        PG-12 (2) ANS-13 (2)  ANS-12 (2)     -12 (2)
//   12 A (1)    INT-12ANS (1)    INT -12ANS (1)        PG -13 (1)     R (1)
//
// « TBC » (to be confirmed) est un code de back-office : il ne veut rien dire
// pour un spectateur, et surtout pas en anglais. Il devient « Classification en
// attente ». Les autres écritures se ramènent au même petit jeu de mentions
// françaises : ANS-12, INT - 12, -12 et INT-12ANS disent tous « interdit aux
// moins de 12 ans ».
//
// Une écriture inconnue est rendue telle quelle plutôt que masquée : mieux vaut
// un code brut qu'une classification muette.

// Clés du dictionnaire (lib/i18n.jsx → rating.*)
const RULES = [
  // Classification non arrêtée par le distributeur
  [/^(TBC|TBA|CTC|NR|UNRATED|UNCLASSIFIED|PENDING)$/, 'pending'],
  // Tous publics
  [/^(TP|U|G|TOUSPUBLICS|TOUTPUBLIC)$/,               'all'],
  // Avertissement (« AVT » dans la grille Cinepax)
  [/^(AVT|AVERTISSEMENT|WARNING)$/,                   'warning'],
  // Accord parental, sans âge attaché
  [/^(PG|PARENTALGUIDANCE)$/,                         'pg'],
  // « R » américain : mineur admis accompagné d'un adulte
  [/^R$/,                                             'restricted'],
  // Moins de 12 ans admis accompagnés (12A britannique)
  [/^12A$/,                                           'a12'],
  // Interdictions par âge — toutes les écritures relevées
  [/^(?:INT|ANS|R|PG)?-?(\d{1,2})(?:ANS|A)?$/,        'under'],
]

// Normalise une écriture : majuscules, sans espaces ni points.
function normalize(raw) {
  return String(raw).toUpperCase().replace(/[\s.]/g, '')
}

// Renvoie { key, age } — `age` seulement pour les interdictions par âge.
// `null` si le champ est vide.
export function ratingCode(raw) {
  if (raw == null || String(raw).trim() === '') return null
  const code = normalize(raw)

  for (const [pattern, key] of RULES) {
    const m = code.match(pattern)
    if (!m) continue
    if (key === 'under') {
      const age = Number(m[1])
      if (!Number.isFinite(age) || age < 3 || age > 21) break  // pas un âge : code brut
      return { key: 'under', age }
    }
    return { key }
  }

  return { key: 'raw', raw: String(raw).trim() }
}

// Libellé affichable. `t` est la fonction de traduction du contexte i18n.
// Renvoie `null` quand le film ne porte aucune classification : une ligne de
// méta ne doit pas s'ouvrir sur un vide.
export function ratingLabel(raw, t) {
  const code = ratingCode(raw)
  if (!code) return null
  if (code.key === 'raw')   return code.raw
  if (code.key === 'under') return t('rating.under', { age: code.age })
  return t(`rating.${code.key}`)
}

// Libellé long, pour l'attribut title d'une pastille : « -12 ans » seul se lit
// mal à voix haute, et un lecteur d'écran ne devine pas l'interdiction.
export function ratingTitle(raw, t) {
  const code = ratingCode(raw)
  if (!code || code.key === 'raw') return undefined
  if (code.key === 'under') return t('rating.underLong', { age: code.age })
  return t(`rating.${code.key}Long`)
}
