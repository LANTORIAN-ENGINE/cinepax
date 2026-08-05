// ─── Le billet ────────────────────────────────────────────────────────────────
// Une seule source pour ce qui est écrit sur un billet, quel que soit l'écran
// qui l'affiche : la confirmation d'achat, la page de retour bancaire et son
// PDF, l'espace client. Le contrôleur à l'entrée doit retrouver la même fiche
// partout, sur un téléphone comme sur une feuille A4.
//
// Ce que le contrôle demande, dans cet ordre : quel film, quel jour, quelle
// salle, quelle heure, combien de places, à quel tarif. La référence sert au
// scanner ; le reste sert à l'œil, quand le scanner ne répond pas.

const TZ = 'Etc/GMT-3'   // Madagascar

// ─── Dates ────────────────────────────────────────────────────────────────────
// Le jour en toutes lettres — au contrôle, « mardi 4 août » se vérifie d'un
// coup d'œil là où « 04/08 » demande un instant de réflexion.
export function ticketDate(iso, locale = 'fr-FR') {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ,
  }).format(d)
}

export function ticketTime(iso, locale = 'fr-FR') {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit', minute: '2-digit', timeZone: TZ,
  }).format(d)
}

// Forme courte et non traduite, pour le contenu du QR : un lecteur générique
// affiche le texte brut, il doit rester lisible sans contexte de langue.
function shortDateTime(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const p = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: TZ,
  }).formatToParts(d)
  const g = type => p.find(x => x.type === type)?.value ?? ''
  return { date: `${g('day')}/${g('month')}/${g('year')}`, time: `${g('hour')}:${g('minute')}` }
}

// ─── Tarif ────────────────────────────────────────────────────────────────────
// Le détail des billets tel qu'il a été composé au plan de salle :
// [{ code, description, priceInCents, qty }] → « 2× Adulte, 1× Enfant ».
// C'est l'information qui manquait au contrôle : deux places ne disent pas si
// elles ont été payées plein tarif ou en tarif enfant.
export function tariffLines(breakdown) {
  if (!Array.isArray(breakdown)) return []
  return breakdown
    .filter(l => l && l.qty > 0)
    .map(l => ({ qty: l.qty, name: l.description || l.code, priceInCents: l.priceInCents }))
}

export function tariffLabel(breakdown, t) {
  const lines = tariffLines(breakdown)
  if (!lines.length) return null
  return lines
    .map(l => (t ? t('ticket.tariffLine', { qty: l.qty, name: l.name }) : `${l.qty}× ${l.name}`))
    .join(', ')
}

// ─── Contenu du QR ────────────────────────────────────────────────────────────
// La référence reste la première clé : c'est elle que le scanner d'admin lit
// (app/admin/reservations/page.jsx → extractRef), et lui seul fait foi puisqu'il
// va rechercher la réservation en base. Les autres clés sont là pour le cas où
// le contrôle se fait à l'appareil photo d'un téléphone, sans notre application :
// le lecteur affiche alors le texte brut, et tout le billet s'y trouve.
//
// Les clés sont en français, courtes, et le tout tient en ~200 octets : un QR
// de version 8 environ, qui se scanne encore sans peine sur un écran de
// téléphone à 160 px.
export function ticketQrPayload({
  ref, filmTitle, sessionTime, screenName, seats, ticketBreakdown,
}) {
  const when  = shortDateTime(sessionTime)
  const list  = (seats || []).filter(Boolean)
  const tarif = tariffLabel(ticketBreakdown, null)

  const payload = { ref }
  if (filmTitle)  payload.film   = filmTitle
  if (when)       payload.date   = when.date
  if (when)       payload.heure  = when.time
  if (screenName) payload.salle  = screenName
  if (list.length) {
    payload.places = list.join(', ')
    payload.nb     = list.length
  }
  if (tarif) payload.tarif = tarif

  return JSON.stringify(payload)
}

// ─── Les lignes du billet ─────────────────────────────────────────────────────
// Rendues telles quelles par la confirmation, la page de retour bancaire et le
// PDF. Une ligne sans valeur disparaît : un billet ne montre pas de tirets.
// `withTariff: false` là où le détail des billets est déjà affiché ligne par
// ligne avec ses montants — inutile de dire deux fois « 2× Adulte ».
export function ticketRows({
  filmTitle, sessionTime, screenName, seats, ticketBreakdown, amount,
}, t, locale = 'fr-FR', { withTariff = true } = {}) {
  const list = (seats || []).filter(Boolean)
  const rows = [
    [t('ticket.film'),   filmTitle],
    [t('ticket.date'),   ticketDate(sessionTime, locale)],
    [t('ticket.time'),   ticketTime(sessionTime, locale)],
    [t('ticket.screen'), screenName],
    [t('ticket.seats'),  list.length
      ? t('ticket.seatList', { n: list.length, count: list.length, list: list.join(', ') })
      : null],
    [t('ticket.tariff'), withTariff ? tariffLabel(ticketBreakdown, t) : null],
    [t('ticket.amount'), amount],
  ]
  return rows.filter(([, v]) => v)
}
