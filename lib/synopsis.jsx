// ─── Mise en forme des synopsis Veezi ─────────────────────────────────────────
// Les synopsis saisis dans Veezi arrivent avec la syntaxe légère des notes de
// presse, qui s'affichait jusqu'ici telle quelle :
//
//   **texte**   → gras
//   *texte*     → italique (les distributeurs y mettent les titres de films)
//   ligne vide  → nouveau paragraphe
//
// Deux pièges viennent des données réelles, d'où les règles de délimitation :
//
//   • « Thunderbolts* » — l'astérisque fait partie du titre du film. Une
//     astérisque collée à un mot n'ouvre donc jamais une emphase : sinon deux
//     mentions du titre dans le même synopsis se retrouveraient reliées et tout
//     le texte intermédiaire passerait en italique.
//   • « taleb_kant , guy_kalou_babiwood » — les pseudos Instagram du casting
//     sont pleins de tirets bas. Le souligné n'est donc pas interprété.

// Profondeur d'imbrication maximale (*a **b** c*), garde-fou contre un texte
// pathologique fait d'astérisques.
const MAX_DEPTH = 3

// Ce qui peut précéder l'ouverture d'une emphase…
const BEFORE_OPEN = /[\s([{«“"'—–-]/
// …et ce qui peut la suivre une fois fermée.
const AFTER_CLOSE = /[\s)\]}»”"'.,;:!?…—–-]/

// ─── Analyse ──────────────────────────────────────────────────────────────────

// Longueur de la suite d'astérisques qui commence à `i` (plafonnée à 3 : au-delà
// on est de toute façon hors syntaxe).
function starRun(text, i) {
  let n = 0
  while (n < 3 && text[i + n] === '*') n++
  return n
}

// Cherche la fermeture de l'emphase ouverte en `start` sur `run` astérisques.
// Renvoie l'index de la fermeture, ou -1 si l'ouverture n'en est pas une.
function findCloser(text, start, run) {
  const before = start === 0 ? ' ' : text[start - 1]
  const after  = text[start + run]
  // L'ouverture doit suivre une frontière de mot et coller au texte emphasé.
  if (!BEFORE_OPEN.test(before)) return -1
  if (!after || /\s/.test(after) || after === '*') return -1

  for (let j = start + run; j < text.length; j++) {
    if (text[j] !== '*') continue
    const here = starRun(text, j)
    if (here !== run) { j += here - 1; continue }
    const inner = text[j - 1]
    const next  = text[j + run]
    // La fermeture colle au texte emphasé et rend la main à une frontière.
    if (!/\s/.test(inner) && inner !== '*' && (next === undefined || AFTER_CLOSE.test(next))) {
      return j
    }
    j += here - 1
  }
  return -1
}

// Découpe un paragraphe en nœuds : texte, sauts de ligne, gras, italique.
function parseInline(text, depth = 0) {
  const nodes = []
  let buffer = ''
  let i = 0

  const flush = () => {
    if (buffer) { nodes.push({ type: 'text', value: buffer }); buffer = '' }
  }

  while (i < text.length) {
    const ch = text[i]

    if (ch === '\n') { flush(); nodes.push({ type: 'br' }); i++; continue }

    if (ch !== '*' || depth >= MAX_DEPTH) { buffer += ch; i++; continue }

    const run    = Math.min(starRun(text, i), 2)
    const closer = findCloser(text, i, run)

    // Astérisque orpheline : elle appartient au texte (« Thunderbolts* »).
    if (closer < 0) { buffer += text.slice(i, i + run); i += run; continue }

    flush()
    nodes.push({
      type: run === 2 ? 'strong' : 'em',
      children: parseInline(text.slice(i + run, closer), depth + 1),
    })
    i = closer + run
  }

  flush()
  return nodes
}

// Synopsis brut → liste de paragraphes, chacun étant une liste de nœuds.
export function parseSynopsis(text) {
  if (!text) return []
  return String(text)
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n+/)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => parseInline(block))
    .filter(nodes => nodes.length > 0)
}

// Fond les paragraphes en une seule suite de nœuds, pour les endroits où le
// texte tient sur deux lignes tronquées et où le découpage n'a plus de sens.
export function flattenSynopsis(paragraphs) {
  return paragraphs.flatMap((nodes, i) =>
    i === 0 ? nodes : [{ type: 'text', value: ' ' }, ...nodes]
  )
}

// ─── Texte brut ───────────────────────────────────────────────────────────────

function nodeText(node) {
  if (node.type === 'text') return node.value
  if (node.type === 'br')   return ' '
  return node.children.map(nodeText).join('')
}

function nodesLength(nodes) {
  return nodes.reduce((total, node) => total + nodeText(node).length, 0)
}

// ─── Troncature ───────────────────────────────────────────────────────────────

// Coupe au dernier mot entier, sauf si cela ampute plus de 40 % de la coupe.
function trimToWord(text, max) {
  const slice = text.slice(0, max)
  const space = slice.lastIndexOf(' ')
  const cut   = space > max * 0.6 ? slice.slice(0, space) : slice
  return cut.replace(/[\s,;:.!?…—–-]+$/, '')
}

// Tronque une suite de nœuds sans jamais casser une balise : le gras et
// l'italique restent fermés, quitte à être coupés à l'intérieur.
function cutNodes(nodes, budget) {
  const out = []
  let used = 0

  for (const node of nodes) {
    if (used >= budget) break
    const room = budget - used

    if (node.type === 'br') { out.push(node); continue }

    if (node.type === 'text') {
      if (node.value.length <= room) { out.push(node); used += node.value.length; continue }
      const slice = trimToWord(node.value, room)
      if (slice) out.push({ type: 'text', value: slice })
      used = budget
      break
    }

    const length = nodeText(node).length
    if (length <= room) { out.push(node); used += length; continue }

    // Un titre de film amputé à deux lettres ne rend service à personne :
    // sous ce seuil on préfère s'arrêter avant.
    if (room < 8) break

    const [children, consumed] = cutNodes(node.children, room)
    if (children.length) out.push({ ...node, children })
    used += consumed
    break
  }

  return [out, used]
}

// Limite un synopsis analysé à `maxChars` caractères visibles.
export function truncateSynopsis(paragraphs, maxChars) {
  const total = paragraphs.reduce((sum, nodes) => sum + nodesLength(nodes), 0)
  if (total <= maxChars) return { paragraphs, truncated: false }

  const kept = []
  let left = maxChars
  for (const nodes of paragraphs) {
    if (left <= 0) break
    const [cut, used] = cutNodes(nodes, left)
    if (cut.length) kept.push(cut)
    left -= used
  }

  return { paragraphs: kept, truncated: true }
}

// ─── Rendu ────────────────────────────────────────────────────────────────────

export function renderSynopsis(nodes) {
  return nodes.map((node, i) => {
    if (node.type === 'text')   return node.value
    if (node.type === 'br')     return <br key={i} />
    if (node.type === 'strong') return <strong key={i}>{renderSynopsis(node.children)}</strong>
    return <em key={i}>{renderSynopsis(node.children)}</em>
  })
}

// Bloc de synopsis mis en forme. `trailing` se glisse à la fin du dernier
// paragraphe : c'est là que se place le bouton « Plus ».
//
// `lang` porte la langue réelle du texte, qui n'est pas toujours celle du site :
// tant qu'une traduction n'est pas prête, on affiche le texte Veezi d'origine.
// L'annoncer évite qu'un lecteur d'écran lise de l'anglais avec une prononciation
// française.
export default function RichText({ text, paragraphs, className, trailing = null, lang }) {
  const blocks = paragraphs || parseSynopsis(text)
  if (!blocks.length) return null

  return (
    <div className={className} lang={lang || undefined}>
      {blocks.map((nodes, i) => (
        <p key={i}>
          {renderSynopsis(nodes)}
          {i === blocks.length - 1 && trailing}
        </p>
      ))}
    </div>
  )
}
