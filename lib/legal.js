// Documents légaux — vocabulaire partagé entre l'admin, les routes API et
// les pages publiques.
//
// Le contenu vit dans Supabase (table legal_documents), pas dans ce fichier :
// l'administrateur le rédige depuis /admin/legal et le site s'en sert
// immédiatement, sans redéploiement. Ce module ne porte que ce qui doit
// rester identique des deux côtés — l'ordre des documents, le nettoyage du
// HTML, la lecture du sommaire.
//
// Aucune dépendance React ni Next : importé aussi bien par une route serveur
// que par un composant client.

// Documents installés par supabase/migration_legal.sql. La liste n'est pas
// fermée : l'administrateur peut en créer d'autres, et tout le front-office
// travaille sur ce que renvoie l'API. Ces constantes servent aux endroits
// qui désignent un document précis (bandeau, tunnel d'achat, repli hors ligne).
export const SLUG_CGU  = 'cgu'
export const SLUG_CGV  = 'cgv'
export const SLUG_RGPD = 'rgpd'
export const SLUG_PDD  = 'pdd'

// Les deux familles de cases à cocher. Le règlement veut que l'accord sur
// le contrat et le consentement au traitement des données soient donnés
// séparément : une case unique couvrant les deux ne vaudrait rien.
export const GROUP_TERMS   = 'terms'
export const GROUP_PRIVACY = 'privacy'
export const CONSENT_GROUPS = [GROUP_TERMS, GROUP_PRIVACY]

export const CONSENT_CONTEXTS = ['register', 'login', 'checkout', 'banner', 'account']

export function legalPath(slug) {
  return `/legal/${slug}`
}

/* ═══════════════════════════════════════════════════════════════
   NETTOYAGE DU HTML

   L'éditeur produit déjà un balisage restreint, mais le corps d'un
   document est écrit par un humain et rendu tel quel dans la page :
   il est filtré à l'écriture, côté serveur, et non à l'affichage.
   Un contenu déjà en base reste donc propre même si l'éditeur change.

   Pas de DOM côté serveur : le filtrage se fait au niveau de la balise,
   par liste blanche. Ce qui n'est pas nommé disparaît.
═══════════════════════════════════════════════════════════════ */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr',
  'h2', 'h3', 'h4',
  'ul', 'ol', 'li',
  'strong', 'b', 'em', 'i', 'u', 's',
  'a', 'blockquote', 'code', 'pre',
])

// Balises dont le contenu part avec elles — laisser le texte d'un <script>
// dans la page reviendrait à en afficher la source.
const VOID_CONTENT_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg']

const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/(?!\/))/i

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Un seul attribut survit : le href d'un lien, et seulement s'il pointe
// vers un schéma inoffensif. javascript:, data: et consorts sont écartés.
function keepAttributes(tag, rawAttrs) {
  if (tag !== 'a') return ''
  const match = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(rawAttrs || '')
  if (!match) return ''

  const href = (match[2] ?? match[3] ?? match[4] ?? '').trim()
  if (!href || !SAFE_HREF.test(href)) return ''

  // Un lien sortant s'ouvre à côté ; rel coupe l'accès à la fenêtre d'origine.
  const external = /^https?:\/\//i.test(href)
  return ` href="${escapeAttr(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}`
}

export function sanitizeLegalHtml(input) {
  if (!input) return ''
  let html = String(input)

  // 1. Commentaires, puis balises à contenu dangereux (ouverture, contenu,
  //    fermeture d'un seul tenant).
  html = html.replace(/<!--[\s\S]*?-->/g, '')
  for (const tag of VOID_CONTENT_TAGS) {
    html = html.replace(new RegExp(`<${tag}\\b[\\s\\S]*?(?:<\\/${tag}\\s*>|$)`, 'gi'), '')
  }

  // 2. Toutes les balises restantes sont réécrites depuis zéro : le nom est
  //    conservé s'il figure dans la liste blanche, les attributs sont
  //    reconstruits, tout le reste tombe. Le texte, lui, est préservé.
  html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (_full, rawName, rawAttrs) => {
    const tag = rawName.toLowerCase()
    if (!ALLOWED_TAGS.has(tag)) return ''
    const closing = /^<\//.test(_full)
    if (closing) return `</${tag}>`
    if (tag === 'br' || tag === 'hr') return `<${tag}>`
    return `<${tag}${keepAttributes(tag, rawAttrs)}>`
  })

  // 3. Un « < » resté seul dans le texte n'est plus une balise après le
  //    passage ci-dessus : il doit se lire comme un caractère.
  html = html.replace(/<(?![a-zA-Z/])/g, '&lt;')

  // 4. Paragraphes vides laissés par l'éditeur en fin de frappe.
  html = html.replace(/<p>(\s|&nbsp;|<br>)*<\/p>/gi, '')

  return html.trim()
}

/* ═══════════════════════════════════════════════════════════════
   LECTURE DU DOCUMENT
═══════════════════════════════════════════════════════════════ */

export function htmlToText(html) {
  if (!html) return ''
  return String(html)
    .replace(/<\/(p|h2|h3|h4|li|blockquote)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// Une minute pour 200 mots — repère haut de fourchette, volontairement :
// annoncer moins que le temps réel de lecture d'un contrat serait de la
// publicité mensongère.
export function readingMinutes(html) {
  const words = htmlToText(html).split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / 200))
}

// Ancre stable dérivée du titre : c'est elle qui relie le sommaire au
// corps du texte, et qui permet de partager le lien d'un article précis.
export function slugifyHeading(text) {
  return htmlToText(text)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// Sommaire : les <h2> du document, dans l'ordre. Les h3 servent de
// subdivisions à l'intérieur d'un article et n'entrent pas au sommaire —
// une liste de trente entrées ne se lit plus.
export function extractHeadings(html) {
  if (!html) return []
  const out = []
  const seen = new Map()
  const re = /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi
  let m
  while ((m = re.exec(html)) !== null) {
    const label = htmlToText(m[1])
    if (!label) continue
    let id = slugifyHeading(label) || `section-${out.length + 1}`
    // Deux titres identiques ne peuvent pas partager la même ancre.
    const n = (seen.get(id) || 0) + 1
    seen.set(id, n)
    if (n > 1) id = `${id}-${n}`
    out.push({ id, label })
  }
  return out
}

// Pose les ancres du sommaire sur les titres, dans le même ordre et avec
// la même règle de dédoublonnage que extractHeadings.
export function anchorHeadings(html) {
  if (!html) return ''
  const seen = new Map()
  let index = 0
  return html.replace(/<h2\b([^>]*)>([\s\S]*?)<\/h2>/gi, (full, attrs, inner) => {
    const label = htmlToText(inner)
    if (!label) return full
    index += 1
    let id = slugifyHeading(label) || `section-${index}`
    const n = (seen.get(id) || 0) + 1
    seen.set(id, n)
    if (n > 1) id = `${id}-${n}`
    return `<h2 id="${escapeAttr(id)}"${attrs}>${inner}</h2>`
  })
}

/* ═══════════════════════════════════════════════════════════════
   PROJECTION VERS LE FRONT-OFFICE

   La base porte deux langues côte à côte (body_fr, body_en). Les pages
   n'en veulent qu'une, déjà choisie. La bascule se fait ici, avec repli
   sur le français quand la traduction n'a pas encore été rédigée : mieux
   vaut un document lisible dans l'autre langue qu'une page blanche.
═══════════════════════════════════════════════════════════════ */

export function pickLang(doc, lang) {
  if (!doc) return null
  const en = lang === 'en'
  return {
    slug:         doc.slug,
    title:        (en && doc.title_en)   || doc.title_fr,
    summary:      (en && doc.summary_en) || doc.summary_fr || '',
    body:         (en && doc.body_en)    || doc.body_fr || '',
    consentLabel: (en && doc.consent_label_en) || doc.consent_label_fr || '',
    version:         doc.version,
    effectiveOn:     doc.effective_on,
    updatedAt:       doc.updated_at,
    requiresConsent: doc.requires_consent,
    consentGroup:    doc.consent_group,
    scrollGate:      doc.scroll_gate,
    inFooter:        doc.in_footer,
    sortOrder:       doc.sort_order,
    // Signale une traduction manquante : la page l'annonce plutôt que de
    // laisser croire que le texte anglais fait foi.
    fallbackLang:    en && !doc.body_en ? 'fr' : null,
  }
}

// Regroupe les documents à consentement en cases à cocher. Une case par
// groupe, le libellé porté par le premier document du groupe, et la liste
// des documents qu'elle couvre — chacun avec son propre lien de lecture.
export function buildConsentGroups(docs, lang) {
  const byGroup = new Map()

  for (const doc of docs || []) {
    if (!doc.requiresConsent || !doc.consentGroup) continue
    if (!byGroup.has(doc.consentGroup)) byGroup.set(doc.consentGroup, [])
    byGroup.get(doc.consentGroup).push(doc)
  }

  const order = new Map(CONSENT_GROUPS.map((g, i) => [g, i]))

  return [...byGroup.entries()]
    .sort((a, b) => (order.get(a[0]) ?? 99) - (order.get(b[0]) ?? 99))
    .map(([group, list]) => {
      const sorted = [...list].sort((a, b) => a.sortOrder - b.sortOrder)
      return {
        group,
        label: sorted.find(d => d.consentLabel)?.consentLabel || '',
        documents: sorted,
        // Les documents qu'il faut avoir ouverts et lus avant de pouvoir cocher
        gated: sorted.filter(d => d.scrollGate).map(d => d.slug),
      }
    })
    .filter(g => g.documents.length > 0)
}

// Un consentement vaut pour une version : celle acceptée doit être celle
// en vigueur. Une nouvelle version publiée remet donc la case à zéro.
export function isConsentCurrent(consent, doc) {
  if (!consent || !doc) return false
  return consent.accepted === true && Number(consent.version) === Number(doc.version)
}

// Ce qui manque à un compte : les documents à consentement dont la version
// en vigueur n'a pas été acceptée. Nourrit le rappel affiché à la connexion.
export function pendingConsents(docs, consents) {
  const current = new Map()
  for (const c of consents || []) {
    const key = c.slug
    const prev = current.get(key)
    if (!prev || Number(c.version) > Number(prev.version)) current.set(key, c)
  }
  return (docs || []).filter(d => d.requiresConsent && !isConsentCurrent(current.get(d.slug), d))
}
