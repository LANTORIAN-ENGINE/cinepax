'use client'

import { useState, useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import SeatMap from '../components/SeatMap'
import { sortByPlanOrder } from '@/lib/seats'
import HeroSlider from '../components/HeroSlider'
import PaymentForm from '../components/PaymentForm'
import BookingConfirmation from '../components/BookingConfirmation'
import AchatBand from '../components/AchatBand'
import FinalSaleNotice from '../components/FinalSaleNotice'
import Aide, { AideNote } from '../components/Aide'
import { useI18n, formatDuration } from '@/lib/i18n'
import { ratingLabel, ratingTitle, genreLabel } from '@/lib/classification'
import { filmPoster, filmBackdrop } from '@/lib/images'
import RichText, { parseSynopsis, truncateSynopsis } from '@/lib/synopsis'
import {
  bookingPath, parseBookingPath, findFilmByParam, homeQuery, parseHomeQuery,
} from '@/lib/bookingRoutes'
import { isSaleOpen, DEFAULTS as VENTE_DEFAUTS } from '@/lib/ventes'

// ─── Config ───────────────────────────────────────────────────────────────────
const CINEMA_ID = '0000000309'
const TZ = 'Etc/GMT-3'

// ─── API helpers ──────────────────────────────────────────────────────────────
async function veeziGet(path) {
  const res = await fetch(`/api/veezi${path}`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

async function connectGet(path) {
  const res = await fetch(`/api/connect${path}`)
  if (!res.ok) throw new Error(`Connect ${res.status} ${res.statusText}`)
  return res.json()
}

async function connectPost(path, body) {
  const res = await fetch(`/api/connect${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Connect ${res.status} ${res.statusText}`)
  return res.json()
}

function generateCartId() {
  return `cinep_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function sessionTime(s) {
  return s.PreShowStartTime || s.FeatureStartTime || s.ShowTime
}

function toDateKey(str) {
  return new Date(str).toLocaleDateString('en-CA', { timeZone: TZ })
}

function formatHourL(str, locale = 'fr-FR') {
  if (!str) return ''
  return new Date(str).toLocaleTimeString(locale, { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
}

function formatTimeL(str, locale = 'fr-FR') {
  if (!str) return ''
  return new Date(str).toLocaleString(locale, { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' })
}

function formatPriceL(cents, moneyLocale = 'fr-MG') {
  if (cents == null || cents < 0) return '—'
  return new Intl.NumberFormat(moneyLocale, { style: 'currency', currency: 'MGA' }).format(cents / 100)
}

// Retourne { dayName: "MAR.", dateStr: "14 AVR." }
function parseDateKeyL(dateKey, locale = 'fr-FR') {
  const d = new Date(dateKey + 'T12:00:00Z')
  const dayName = d.toLocaleDateString(locale, { timeZone: TZ, weekday: 'short' }).toUpperCase().replace('.', '') + '.'
  const day = d.toLocaleDateString(locale, { timeZone: TZ, day: 'numeric', month: 'short' }).toUpperCase()
  return { dayName, dateStr: day }
}

function formatDateHeaderL(dateKey, locale = 'fr-FR') {
  const d = new Date(dateKey + 'T12:00:00Z')
  return d.toLocaleDateString(locale, { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' })
}

// ─── Sélecteur de dates ───────────────────────────────────────────────────────
function DatePicker({ days, selected, onSelect }) {
  const { t, locale } = useI18n()
  const VISIBLE = 5
  const [offset, setOffset] = useState(0)

  const selIdx = days.indexOf(selected)
  useEffect(() => {
    if (selIdx >= 0 && selIdx < offset) setOffset(selIdx)
    if (selIdx >= offset + VISIBLE) setOffset(selIdx - VISIBLE + 1)
  }, [selIdx, offset])

  const visible = days.slice(offset, offset + VISIBLE)

  return (
    <div className="date-picker">
      <button
        className="date-arrow"
        onClick={() => setOffset(o => Math.max(0, o - 1))}
        disabled={offset === 0}
        aria-label={t('home.prev')}
      >
        ‹
      </button>

      <div className="date-list">
        {visible.map(day => {
          const { dayName, dateStr } = parseDateKeyL(day, locale)
          return (
            <button
              key={day}
              className={`date-item ${selected === day ? 'active' : ''}`}
              onClick={() => onSelect(day)}
            >
              <span className="day-name">{dayName}</span>
              <span className="day-num">{dateStr}</span>
            </button>
          )
        })}
      </div>

      <button
        className="date-arrow"
        onClick={() => setOffset(o => Math.min(days.length - VISIBLE, o + 1))}
        disabled={offset + VISIBLE >= days.length}
        aria-label={t('home.next')}
      >
        ›
      </button>
    </div>
  )
}

// ─── Séance complète ──────────────────────────────────────────────────────────
// Veezi donne deux signaux concordants sur /v1/session, renseignés pour toutes
// les séances quel que soit leur canal de vente :
//
//   TicketsSoldOut  drapeau du back-office ; il compte aussi les places
//                   retenues dans les paniers en cours (SeatsHeld), pas
//                   seulement les billets encaissés (SeatsSold)
//   SeatsAvailable  places encore libres — 0 quand la salle est prise
//
// Sur la programmation observée les deux s'accordent exactement (par ex.
// 81 vendues + 9 retenues = 90 places, SeatsAvailable 0, TicketsSoldOut true).
// On lit quand même les deux : le premier qui dit « complet » suffit, et une
// grille qui n'aurait pas le drapeau reste correctement fermée. L'égalité
// stricte à 0 est voulue — un SeatsAvailable absent ne vaut pas complet.
//
// Même lecture que l'API du programme (app/api/programme/route.js).
function isSoldOut(session) {
  return session?.TicketsSoldOut === true || session?.SeatsAvailable === 0
}

// ─── Bouton de séance ─────────────────────────────────────────────────────────
// L'heure *est* le bouton d'achat. Au survol elle glisse vers le haut et cède
// la place au verbe : le bouton dit alors ce qu'il fait, sans changer de
// taille — la seconde ligne est hors flux, rien ne bouge dans la rangée.
//
// Une séance complète occupe exactement la même géométrie, sa seconde ligne
// déjà sortie : heure barrée, mention ÉPUISÉ, et plus rien à cliquer. Ce n'est
// pas un bouton désactivé mais un simple libellé — il n'y a aucune action à
// proposer, autant ne pas en annoncer une au clavier ni au lecteur d'écran.
function SessionButton({ session, hour, onSelect }) {
  const { t } = useI18n()

  if (isSoldOut(session)) {
    return (
      <span className="session-time-btn is-soldout">
        <s className="session-time-hour">{hour}</s>
        <span className="session-time-flag">{t('sessions.soldOut')}</span>
      </span>
    )
  }

  return (
    <button
      className="session-time-btn"
      onClick={() => onSelect(session)}
      aria-label={t('sessions.buyAria', { hour })}
    >
      <span className="session-time-hour">{hour}</span>
      <span className="session-time-cta" aria-hidden="true">{t('sessions.buyShort')}</span>
    </button>
  )
}

// ─── Repère d'achat ───────────────────────────────────────────────────────────
// L'horaire *est* le bouton d'achat, mais rien ne le dit tant qu'on ne l'a pas
// cliqué. Cette ligne le dit — et le montre : le membre de phrase qui désigne
// l'horaire porte le rouge des pastilles de séance, seul autre rouge de la
// liste. Au survol, les pastilles s'entourent du même rouge : la phrase
// désigne alors littéralement ce dont elle parle (voir .buy-hint dans
// globals.css). Posée au-dessus de chaque liste d'horaires cliquables :
// l'accueil et la page film.
function BuyHint() {
  const { t } = useI18n()
  return (
    <p className="buy-hint">
      {t('achat.howToBefore')}
      <strong className="buy-hint-target">{t('achat.howToTarget')}</strong>
      {t('achat.howToAfter')}
    </p>
  )
}

// ─── Vente refermée ───────────────────────────────────────────────────────────
// Une liste vide n'a pas toujours le même sens. « Aucune séance » est faux
// quand il en reste trois ce soir et que seule la vente en ligne s'est
// refermée : le client apprendrait que le cinéma ne joue plus, alors qu'il
// peut encore y aller. Cette note prend la place de l'état vide dans ce cas
// précis, dit combien de séances sont concernées, et renvoie à la caisse.
function SaleClosedNote({ count, delay }) {
  const { t, lang } = useI18n()
  // Sans délai réglé, ce qui a disparu de la liste n'a pas été refermé
  // d'avance : la séance a simplement commencé. Parler d'un délai qui vaut
  // zéro donnerait « la vente s'arrête  avant le début ».
  const key = delay > 0 ? 'ventes.noteLead' : 'ventes.noteStarted'
  return (
    <div className="sale-closed-note" role="status">
      <p className="sale-closed-note-lead">
        {t(key, { n: count, count, delay: formatDuration(delay, lang) })}
      </p>
      <p className="sale-closed-note-desk">{t('ventes.closedDesk')}</p>
    </div>
  )
}

// ─── Skeleton: sélecteur de dates ─────────────────────────────────────────────
// Cinq jours, comme le vrai sélecteur, flèches comprises : la rangée occupe sa
// hauteur définitive avant de connaître les dates. Les chevrons sont dessinés
// pour de vrai — on sait déjà qu'ils seront là, et un fantôme de chevron ne
// dirait rien de plus.
function DatePickerSkeleton() {
  return (
    <div className="date-picker sk-date-picker" aria-hidden="true">
      <span className="date-arrow" aria-hidden="true">‹</span>
      <div className="date-list">
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="date-item sk-date-item" style={{ '--sk-delay': `${i * 0.06}s` }}>
            <span className="sk-shine sk-date-name" />
            <span className="sk-shine sk-date-num" />
          </div>
        ))}
      </div>
      <span className="date-arrow" aria-hidden="true">›</span>
    </div>
  )
}

// ─── Skeleton: liste de films ─────────────────────────────────────────────────
// Trois fiches, à la géométrie exacte de .film-row : même gouttière, même
// hauteur d'affiche, mêmes pastilles de séance. Ce que ce squelette occupe,
// les vraies fiches l'occuperont — le remplacement ne déplace rien.
//
// Les largeurs varient d'une fiche à l'autre. Trois cartes rigoureusement
// identiques se lisent comme un motif ; une liste de films n'en est pas un.
const SK_FILMS = [
  { title: '58%', title2: '41%', meta: '32%', syn: ['100%', '92%', '58%'], pills: [96, 104, 96] },
  { title: '46%', title2: '29%', meta: '26%', syn: ['100%', '84%', '71%'], pills: [104, 96, 112, 96] },
  { title: '64%', title2: '35%', meta: '30%', syn: ['96%', '100%', '44%'], pills: [96, 96] },
]

function FilmsListSkeleton() {
  const { t } = useI18n()

  return (
    <div className="sk-films-list" aria-busy="true" aria-label={t('home.loading')}>
      {SK_FILMS.map((sk, i) => (
        <div key={i} className="sk-film-card" style={{ '--sk-delay': `${i * 0.12}s` }}>
          <hr className="section-divider" />
          <div className="sk-film-inner">
            {/* Affiche */}
            <div className="sk-poster sk-shine" />

            {/* Infos */}
            <div className="sk-info">
              {/* Classification + genre */}
              <div className="sk-badge-row">
                <div className="sk-badge sk-shine" />
                <div className="sk-badge sk-shine" style={{ width: 52 }} />
              </div>
              {/* Titre */}
              <div className="sk-shine sk-title-line" style={{ width: sk.title }} />
              <div className="sk-shine sk-title-line" style={{ width: sk.title2, marginTop: 6 }} />
              {/* Durée, version */}
              <div className="sk-shine sk-meta-line" style={{ width: sk.meta, marginTop: 14 }} />
              {/* Synopsis */}
              <div className="sk-synopsis">
                {sk.syn.map((w, j) => (
                  <div key={j} className="sk-shine sk-syn-line" style={{ width: w }} />
                ))}
              </div>
              {/* Horaires */}
              <div className="sk-sessions-row">
                {sk.pills.map((w, j) => (
                  <div key={j} className="sk-session-pill sk-shine" style={{ width: w }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Skeleton: plan de salle ──────────────────────────────────────────────────
function SeatMapSkeleton() {
  const { t } = useI18n()
  // Représentation approximative d'une salle (2 groupes par rangée)
  const rows = [
    { label: 'A', g1: 8, g2: 2 },
    { label: 'B', g1: 8, g2: 2 },
    { label: 'C', g1: 8, g2: 2 },
    { label: 'D', g1: 8, g2: 2 },
    { label: 'E', g1: 8, g2: 2 },
    { label: 'F', g1: 8, g2: 2 },
    { label: 'G', g1: 8, g2: 4 },
    { label: 'H', g1: 4, g2: 4 },
  ]
  return (
    <div className="sk-seatmap-wrap">
      <div className="cinema-hall sk-hall">
        {/* Faisceau projecteur réel */}
        <div className="projector-beam" />

        {/* Écran — reprend les vrais styles */}
        <div className="screen-area">
          <div className="cinema-screen-bar">
            <div className="screen-surface sk-screen-glow" />
            <div className="screen-halo" />
          </div>
          <div className="screen-label">{t('seatmap.screen')}</div>
          {/* Réserve la place du bandeau des places choisies — le gradin
              se dessine à la même hauteur avant et après le chargement. */}
          <div className="seat-readout" aria-hidden="true" />
        </div>

        {/* Rangées squelettes */}
        <div className="seating-area">
          {rows.map((row, ri) => (
            <div key={row.label} className="seat-row sk-seat-row" style={{ '--ri': ri }}>
              <span className="row-label sk-label-ghost">{row.label}</span>

              {/* groupe 1 */}
              <div className="seat-group-wrap">
                <div className="seat-group">
                  {Array.from({ length: row.g1 }).map((_, si) => (
                    <div key={si} className="sk-seat-ghost" style={{ '--si': si }} />
                  ))}
                </div>
              </div>

              {/* allée */}
              <div className="aisle" />

              {/* groupe 2 */}
              <div className="seat-group-wrap">
                <div className="seat-group">
                  {Array.from({ length: row.g2 }).map((_, si) => (
                    <div key={si} className="sk-seat-ghost" style={{ '--si': row.g1 + si }} />
                  ))}
                </div>
              </div>

              <span className="row-label sk-label-ghost">{row.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Légende squelette */}
      <div className="sk-legend-row">
        {[80, 96, 60, 80, 72].map((w, i) => (
          <div key={i} className="sk-legend-item">
            <div className="sk-legend-dot sk-shine-dark" />
            <div className="sk-shine-dark" style={{ width: w, height: 10, borderRadius: 5 }} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Skeleton: restauration d'une URL profonde ────────────────────────────────
// Affiché le temps que films et séances arrivent, quand on entre par un lien
// partagé ou un F5 au milieu du tunnel. Reprend les blocs des squelettes
// existants : la page ne montre jamais l'accueil avant de basculer sur l'étape
// demandée.
function RestoringSkeleton({ step }) {
  return (
    <div className="page-container">
      <hr className="section-divider" />
      <div className="sk-film-inner">
        <div className="sk-poster sk-shine" />
        <div className="sk-info">
          <div className="sk-shine sk-title-line" />
          <div className="sk-shine sk-title-line" style={{ width: '45%', marginTop: 6 }} />
          <div className="sk-shine sk-meta-line" style={{ marginTop: 14 }} />
          <div className="sk-sessions-row">
            {[0, 1, 2, 3].map(j => (
              <div key={j} className="sk-session-pill sk-shine" />
            ))}
          </div>
        </div>
      </div>
      {step !== 'sessions' && <SeatMapSkeleton />}
    </div>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────
// `initialRoute` vient du segment d'URL servi par Next (app/film/…/page.jsx).
// Sur l'accueil il vaut { step: 'films' } : le tunnel démarre alors exactement
// comme avant, sans restauration à faire.
export default function BookingFlow({ initialRoute }) {
  const { t, lang, locale, moneyLocale } = useI18n()
  const tr = t   // alias utilisable là où `t` est masqué (ex: sessionTickets.map(t => …))
  const formatHour       = (s) => formatHourL(s, locale)
  const formatTime       = (s) => formatTimeL(s, locale)
  const formatPrice      = (c) => formatPriceL(c, moneyLocale)
  const formatDateHeader = (d) => formatDateHeaderL(d, locale)

  // Le libellé d'un billet vient du back-office quand il répond ; sinon c'est
  // une tranche d'âge de l'affiche, traduite ici.
  const ticketLabel = (tk) =>
    tk.Description || (tk.BracketId ? tr(`offers.age.${tk.BracketId}`) : tk.TicketTypeCode)

  const [step, setStep] = useState('films')

  const [films, setFilms] = useState([])
  // Synopsis résolus dans la langue courante — voir /api/synopsis. Tant que la
  // réponse n'est pas là, l'affichage retombe sur le texte brut de la fiche
  // Veezi : rien ne clignote, rien n'attend.
  const [synopses, setSynopses] = useState({})
  const [allSessions, setAllSessions] = useState([])
  const [selectedFilm, setSelectedFilm] = useState(null)
  const [selectedSession, setSelectedSession] = useState(null)
  const [selectedDay, setSelectedDay] = useState(null)

  const [seatPlanData, setSeatPlanData] = useState(null)
  const [seatPlanError, setSeatPlanError] = useState(null)
  const [loadingSeats, setLoadingSeats] = useState(false)
  const [selectedSeats, setSelectedSeats] = useState([])

  const [paymentMethod, setPaymentMethod] = useState('card')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [orderResult, setOrderResult] = useState(null)
  const [loadingOrder, setLoadingOrder] = useState(false)
  const [loadingPayment, setLoadingPayment] = useState(false)
  const [ticketUnitPrice, setTicketUnitPrice] = useState(null)
  const [priceLabel, setPriceLabel] = useState(null)
  const [sessionTickets, setSessionTickets] = useState(null)  // grille tarifaire live (Connect /tickets)
  const [ticketCounts, setTicketCounts] = useState({})        // { [TicketTypeCode]: quantité }
  const [priceSource, setPriceSource] = useState(null)        // 'veezi' | 'session' | 'price_card' | 'reference'
  const [loadingPrice, setLoadingPrice] = useState(false)
  const [bookingResult, setBookingResult] = useState(null)

  const [groupBy, setGroupBy] = useState('jour')   // 'jour' | 'film'
  const [sortBy, setSortBy] = useState('heure')     // 'heure' | 'alpha' | 'recent'
  const [openDropdown, setOpenDropdown] = useState(null) // 'group' | 'sort' | null
  const [expandedFilms, setExpandedFilms] = useState(new Set())

  // Chargé dès le premier rendu, et non au premier effet. Le catalogue est
  // demandé dans un effet, qui ne s'exécute qu'après la peinture : partir de
  // `false` faisait rendre au serveur, puis peindre au client, un écran de
  // films vide — « Aucun film programmé ce jour » et pas de bandeau — avant
  // que la requête soit seulement partie. Sur une connexion lente ce faux
  // état vide restait à l'écran le temps du chargement du script.
  //
  // À `true`, le HTML servi est déjà celui de l'attente : le squelette est
  // visible avant même que React ait repris la main.
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // ── Fermeture de la vente en ligne ──────────────────────────────────────────
  // La vente se referme un délai avant la séance (réglé dans /admin/parametres).
  // Le délai arrive avec les films ; d'ici là il vaut zéro, c'est-à-dire le
  // comportement d'avant — mieux vaut montrer un horaire de trop pendant une
  // seconde que faire clignoter la liste.
  //
  // L'heure courante est un état qui avance : une séance se referme pendant
  // qu'on regarde la page, et la liste doit s'en apercevoir sans rechargement.
  // Trente secondes suffisent — la minute est l'unité du réglage.
  const [cutoffMinutes, setCutoffMinutes] = useState(VENTE_DEFAUTS.cutoffMinutes)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const isOpenForSale = (s) => isSaleOpen(sessionTime(s), cutoffMinutes, now)

  const cartIdRef = useRef(generateCartId())

  // ─── Routage ────────────────────────────────────────────────────────────────
  // Chaque étape a son adresse, écrite avec l'API History : le tunnel reste
  // monté d'un bout à l'autre (aucun rechargement, aucun appel Veezi rejoué),
  // seule l'URL change. Voir lib/bookingRoutes.js pour la forme des adresses.

  // Route réclamée par l'URL et pas encore appliquée : au premier rendu pour un
  // lien partagé ou un F5, puis à chaque retour / avance du navigateur.
  const [pendingRoute, setPendingRoute] = useState(
    initialRoute && initialRoute.step !== 'films' ? initialRoute : null
  )
  const replaceNextRef = useRef(false)  // écrire l'URL sans empiler d'entrée
  const dayTouchedRef  = useRef(false)  // la date n'entre dans l'URL qu'une fois choisie
  // Dernier chemin observé, pour distinguer un vrai changement d'adresse d'un
  // simple rendu — voir l'effet qui écoute usePathname. `null` tant qu'aucun
  // rendu n'a eu lieu : l'adresse d'entrée est l'affaire de la restauration.
  const seenPathRef = useRef(null)
  // Films et séances chargés — succès ou échec. Sans ce repère, une
  // programmation vide laisserait une URL profonde en attente pour toujours.
  const [dataLoaded, setDataLoaded] = useState(false)

  // Applique une route à l'état du tunnel et renvoie l'étape réellement
  // atteinte — `null` tant que les données manquent, la route restant alors en
  // attente. On dégrade vers l'étape la plus profonde reconstituable : les
  // places choisies ne sont pas dans l'URL, un paiement ne se rejoue pas à
  // froid.
  function applyRoute(route) {
    if (!route || route.step === 'films') {
      const q = parseHomeQuery(window.location.search)
      if (q.groupBy) setGroupBy(q.groupBy)
      if (q.sortBy) setSortBy(q.sortBy)
      if (q.selectedDay) { dayTouchedRef.current = true; setSelectedDay(q.selectedDay) }
      setStep('films')
      return 'films'
    }

    const film = findFilmByParam(films, route.filmParam)
    if (!film) return null
    setSelectedFilm(film)

    if (route.step === 'sessions' || !route.sessionId) {
      setStep('sessions')
      return 'sessions'
    }

    const session = allSessions.find(s => String(s.Id) === String(route.sessionId))
    if (!session) return null

    // Séance déjà chargée (retour depuis le paiement) : on conserve le plan de
    // salle et les places sélectionnées, rien n'est rechargé.
    const sameSession = String(selectedSession?.Id) === String(session.Id)
    if (!sameSession) selectSession(session)

    if (route.step === 'seats' || !sameSession) { setStep('seats'); return 'seats' }
    if (selectedSeats.length === 0) { setStep('seats'); return 'seats' }
    if (route.step === 'done' && !bookingResult) { setStep('seats'); return 'seats' }
    setStep(route.step)
    return route.step
  }

  // applyRoute et le chemin attendu se referment sur l'état du rendu courant.
  // On en garde la dernière version dans des refs : les effets ci-dessous s'en
  // servent sans avoir à les lister en dépendance, ce qui les relancerait à
  // chaque rendu. Cet effet est déclaré en premier — les effets s'exécutent
  // dans l'ordre de déclaration, les refs sont donc à jour pour les suivants.
  const applyRouteRef   = useRef(null)
  const expectedPathRef = useRef(bookingPath(step, selectedFilm, selectedSession))
  useEffect(() => {
    applyRouteRef.current = applyRoute
    expectedPathRef.current = bookingPath(step, selectedFilm, selectedSession)
  })

  // Restauration : on attend que films et séances soient chargés pour résoudre
  // l'URL d'entrée. Si elle ne mène nulle part (séance passée, lien périmé), on
  // reste sur l'accueil et l'effet suivant corrige l'adresse.
  useEffect(() => {
    if (!pendingRoute) return
    if (!films.length && !dataLoaded) return
    const applied = applyRouteRef.current?.(pendingRoute)
    if (applied !== pendingRoute.step) replaceNextRef.current = true
    setPendingRoute(null)
  }, [pendingRoute, films, allSessions, dataLoaded])

  // L'URL suit l'étape affichée.
  useEffect(() => {
    if (pendingRoute) return  // restauration en cours : c'est l'URL qui fait foi
    const path = bookingPath(step, selectedFilm, selectedSession)
    const query = step === 'films'
      ? homeQuery({ selectedDay: dayTouchedRef.current ? selectedDay : null, groupBy, sortBy })
      : null
    const { pathname, search } = window.location
    // Hors accueil, la query appartient à l'écran affiché (le formulaire de
    // paiement y range son sous-écran) : on la laisse telle quelle.
    const target = path + (query ?? (pathname === path ? search : ''))
    if (target === pathname + search) return
    // Même écran, seuls les filtres ont bougé → on remplace au lieu d'empiler.
    const replace = replaceNextRef.current || pathname === path
    replaceNextRef.current = false
    window.history[replace ? 'replaceState' : 'pushState']({}, '', target)
  }, [step, selectedFilm, selectedSession, selectedDay, groupBy, sortBy, pendingRoute])

  // Retour / avance du navigateur : l'URL redevient la consigne. On applique
  // tout de suite — les données sont déjà en mémoire — pour que l'écran change
  // d'un bloc, sans repasser par un état de chargement.
  useEffect(() => {
    function onPopState() {
      const route = parseBookingPath(window.location.pathname)
      const applied = applyRouteRef.current?.(route)
      if (applied == null) { setPendingRoute(route); return }  // données absentes
      if (applied !== route.step) replaceNextRef.current = true
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // Adresse changée sans passer par le tunnel — typiquement le lien
  // « Actuellement » de la barre de navigation, cliqué depuis une étape.
  //
  // Le routeur Next reste sur la route par laquelle on est entré : nos
  // pushState déplacent l'adresse, pas lui. Un lien vers « / » depuis
  // /film/… ne provoque donc aucun rendu de page — Next se contente de
  // ramener l'adresse à celle qu'il croit servir. L'écran resterait figé sur
  // l'étape précédente, en désaccord avec la barre d'adresse.
  //
  // usePathname suit ces mouvements : on se cale dessus. La dépendance est
  // volontairement limitée au chemin, pour ne réagir qu'à un vrai changement
  // d'adresse et jamais à nos propres écritures, toujours en retard d'un rendu
  // sur l'étape qui vient de changer.
  const pathname = usePathname()
  useEffect(() => {
    const previous = seenPathRef.current
    seenPathRef.current = pathname
    if (previous === null) return              // adresse d'entrée : déjà traitée
    if (pathname === previous) return          // pas un changement d'adresse
    if (pathname === expectedPathRef.current) return  // notre propre écriture
    const route = parseBookingPath(pathname)
    const applied = applyRouteRef.current?.(route)
    if (applied == null) { setPendingRoute(route); return }
    if (applied !== route.step) replaceNextRef.current = true
  }, [pathname])

  // Filtres d'accueil reçus par lien partagé (/?groupe=film&tri=alpha).
  useEffect(() => {
    const q = parseHomeQuery(window.location.search)
    if (q.groupBy) setGroupBy(q.groupBy)
    if (q.sortBy) setSortBy(q.sortBy)
    if (q.selectedDay) dayTouchedRef.current = true
  }, [])

  useEffect(() => {
    setLoading(true)
    // Le délai de fermeture accompagne le catalogue : il conditionne quelles
    // séances sont montrées, autant l'avoir avant le premier rendu de la
    // liste. Un échec de sa route ne compromet rien — on vend comme avant.
    const reglages = fetch('/api/ventes')
      .then(r => (r.ok ? r.json() : VENTE_DEFAUTS))
      .catch(() => VENTE_DEFAUTS)

    Promise.all([veeziGet('/v4/film'), veeziGet('/v1/session'), reglages])
      .then(([filmsData, sessionsData, vente]) => {
        const maintenant = Date.now()
        const delai = vente?.cutoffMinutes ?? VENTE_DEFAUTS.cutoffMinutes
        setCutoffMinutes(delai)
        setNow(maintenant)

        const futureSessions = (Array.isArray(sessionsData) ? sessionsData : [sessionsData])
          .filter(s => new Date(sessionTime(s)).getTime() > maintenant)
          .sort((a, b) => new Date(sessionTime(a)) - new Date(sessionTime(b)))

        const filmIdsWithSessions = new Set(futureSessions.map(s => String(s.FilmId)))
        const upcomingFilms = (Array.isArray(filmsData) ? filmsData : [filmsData])
          .filter(f => filmIdsWithSessions.has(String(f.Id)))

        setFilms(upcomingFilms)
        setAllSessions(futureSessions)

        // La date d'ouverture est celle du premier horaire encore en vente :
        // atterrir sur un jour dont tout est refermé donnerait une page vide.
        const enVente = futureSessions.filter(s => isSaleOpen(sessionTime(s), delai, maintenant))
        const premieres = enVente.length ? enVente : futureSessions
        if (premieres.length > 0) {
          // Une date reçue par lien (?jour=) l'emporte, si elle est à l'affiche.
          const days = new Set(premieres.map(s => toDateKey(sessionTime(s))))
          const wanted = parseHomeQuery(window.location.search).selectedDay
          setSelectedDay(wanted && days.has(wanted)
            ? wanted
            : toDateKey(sessionTime(premieres[0])))
        }
      })
      .catch(e => setError(e.message))
      .finally(() => { setLoading(false); setDataLoaded(true) })
  }, [])

  // Synopsis dans la langue affichée. Le serveur cherche d'abord le texte déjà
  // rédigé dans cette langue sur une fiche sœur (VF/VO), puis sa traduction en
  // cache ; il ne traduit jamais pendant que le visiteur attend. Un échec est
  // sans conséquence : on garde les synopsis bruts reçus de Veezi.
  useEffect(() => {
    if (!films.length) return
    let annule = false
    const ids = films.map(f => f.Id).join(',')
    fetch(`/api/synopsis?lang=${lang}&ids=${encodeURIComponent(ids)}`)
      .then(res => res.json())
      .then(data => { if (!annule) setSynopses(data.synopsis || {}) })
      .catch(() => {})
    return () => { annule = true }
  }, [films, lang])

  // Réconcilie les quantités de billets avec le nombre de places sélectionnées :
  // la somme des quantités doit toujours égaler le nombre de sièges. Le surplus/
  // déficit est absorbé par le billet plein tarif (1er de la liste triée).
  useEffect(() => {
    if (!sessionTickets?.length) return
    const target = selectedSeats.length
    setTicketCounts(prev => {
      const codes = sessionTickets.map(t => t.TicketTypeCode)
      const next = {}
      let sum = 0
      for (const c of codes) { next[c] = Math.max(0, prev[c] || 0); sum += next[c] }
      let diff = target - sum
      if (diff > 0) {
        const primary = codes[0]
        next[primary] = (next[primary] || 0) + diff
      } else if (diff < 0) {
        // retire l'excédent en partant des types secondaires
        let toRemove = -diff
        for (let i = codes.length - 1; i >= 0 && toRemove > 0; i--) {
          const take = Math.min(next[codes[i]], toRemove)
          next[codes[i]] -= take
          toRemove -= take
        }
      }
      return next
    })
  }, [selectedSeats.length, sessionTickets])

  // Détail des billets choisis. Calculé une seule fois pour les trois écrans
  // qui l'affichent — plan de salle, paiement, confirmation — afin que le même
  // récapitulatif suive le client jusqu'à la validation de l'achat.
  const ticketBreakdown = (sessionTickets || [])
    .map(tk => ({
      code:         tk.TicketTypeCode,
      description:  ticketLabel(tk),
      priceInCents: tk.PriceInCents,
      qty:          ticketCounts[tk.TicketTypeCode] || 0,
    }))
    .filter(tk => tk.qty > 0)

  const breakdownTotalCents = ticketBreakdown.length
    ? ticketBreakdown.reduce((s, tk) => s + tk.qty * tk.priceInCents, 0)
    : null

  // ── Ce qui est encore en vente ──────────────────────────────────────────────
  // `allSessions` garde toutes les séances à venir : un lien partagé vers une
  // séance refermée doit pouvoir l'expliquer plutôt que renvoyer une page
  // vide. Tout ce qui s'affiche part en revanche de `openSessions`.
  const openSessions = allSessions.filter(isOpenForSale)

  const availableDays = [...new Set(openSessions.map(s => toDateKey(sessionTime(s))))].sort()
  const availableDaysKey = availableDays.join('|')

  // Le jour choisi peut se vider en cours de visite — la dernière séance du
  // soir se referme et la date disparaît du sélecteur. On glisse alors au
  // premier jour encore en vente au lieu de laisser une liste vide.
  useEffect(() => {
    if (!selectedDay || !availableDays.length) return
    if (availableDays.includes(selectedDay)) return
    setSelectedDay(availableDays[0])
  }, [selectedDay, availableDaysKey])

  const sessionsByDay = (groupBy === 'film' || !selectedDay)
    ? openSessions
    : openSessions.filter(s => toDateKey(sessionTime(s)) === selectedDay)

  // Séances du jour affiché toutes catégories confondues, refermées comprises.
  // Sert à distinguer « plus rien ce jour-là » de « plus rien en ligne » : les
  // deux donnent une liste vide, et ce ne sont pas les mêmes phrases à dire.
  const anySessionsOnDay = (groupBy === 'film' || !selectedDay)
    ? allSessions
    : allSessions.filter(s => toDateKey(sessionTime(s)) === selectedDay)

  const filmIdsOnDay = new Set(sessionsByDay.map(s => String(s.FilmId)))
  const visibleFilms = films
    .filter(f => filmIdsOnDay.has(String(f.Id)))
    .sort((a, b) => {
      if (sortBy === 'alpha') {
        return a.Title.localeCompare(b.Title, locale)
      }
      if (sortBy === 'recent') {
        return Number(b.Id) - Number(a.Id)
      }
      // 'heure' : première séance la plus proche
      const aFirst = sessionsByDay.find(s => String(s.FilmId) === String(a.Id))
      const bFirst = sessionsByDay.find(s => String(s.FilmId) === String(b.Id))
      if (!aFirst) return 1
      if (!bFirst) return -1
      return new Date(sessionTime(aFirst)) - new Date(sessionTime(bFirst))
    })

  // Films mis en avant dans le carrousel d'accueil : tous ceux à l'affiche,
  // du plus proche au plus lointain. Indépendant du sélecteur de date, pour que
  // le carrousel ne se recompose pas quand on navigue dans les jours.
  const filmIdsOnSale = new Set(openSessions.map(s => String(s.FilmId)))
  const heroFilms = films
    .filter(f => filmIdsOnSale.has(String(f.Id)))
    .sort((a, b) => {
      const aFirst = openSessions.find(s => String(s.FilmId) === String(a.Id))
      const bFirst = openSessions.find(s => String(s.FilmId) === String(b.Id))
      if (!aFirst) return 1
      if (!bFirst) return -1
      return new Date(sessionTime(aFirst)) - new Date(sessionTime(bFirst))
    })

  const sessionsForFilm = selectedFilm
    ? sessionsByDay.filter(s => String(s.FilmId) === String(selectedFilm.Id))
    : []

  // Toutes les séances du film sélectionné, groupées par jour
  const allSessionsForFilm = selectedFilm
    ? openSessions.filter(s => String(s.FilmId) === String(selectedFilm.Id))
    : []

  // Le même film a-t-il des séances à venir mais refermées ? La fiche le dit
  // alors, au lieu d'annoncer « aucune séance » pour un film qui joue ce soir.
  const closedSessionsForFilm = selectedFilm
    ? allSessions.filter(s =>
        String(s.FilmId) === String(selectedFilm.Id) && !isOpenForSale(s))
    : []

  const allSessionsByDate = availableDays
    .filter(day => allSessionsForFilm.some(s => toDateKey(sessionTime(s)) === day))
    .map(day => ({
      day,
      sessions: allSessionsForFilm.filter(s => toDateKey(sessionTime(s)) === day),
    }))

  // La date choisie entre dans l'URL ; tant qu'on n'y a pas touché, l'accueil
  // reste « / ».
  function chooseDay(day) {
    dayTouchedRef.current = true
    setSelectedDay(day)
  }

  function selectFilm(film) {
    setSelectedFilm(film)
    setSelectedSession(null)
    setError(null)
    setStep('sessions')
  }

  // Résout le prix unitaire d'une séance, par ordre de priorité :
  //   1. Grille tarifaire « live » du back-office Veezi via l'API Connect
  //      GET /RESTData.svc/cinemas/{id}/sessions/{id}/tickets
  //      (ne répond que si le canal CINEP est actif sur la séance)
  //   2. Prix enregistré en base (Supabase) : session_prices puis price_cards
  //   3. Grille de l'affiche officielle, servie par /api/prices
  // Met à jour ticketUnitPrice (en centimes) dès qu'une source répond.
  //
  // Les sources 1 et 3 renvoient la même structure de billets — plein tarif en
  // tête — donc le sélecteur de type de billet, le total et le récapitulatif du
  // paiement fonctionnent à l'identique, quelle que soit celle qui a répondu.
  async function resolveSessionPrice(session) {
    const sessionId = session?.Id
    setLoadingPrice(true)
    try {
      // 1) Grille tarifaire live du back-office (lecture seule, pas de commande)
      try {
        const data = await connectGet(
          `/RESTData.svc/cinemas/${CINEMA_ID}/sessions/${sessionId}/tickets`
        )
        if (data?.ResponseCode === 0 && Array.isArray(data.Tickets) && data.Tickets.length) {
          // On ne garde que les billets payants réellement vendables en ligne (CINEP)
          const buyable = data.Tickets.filter(
            t => t.PriceInCents > 0 && (t.SalesChannels || []).includes('CINEP')
          )
          // Trié par DisplaySequence : le 1er est le billet « plein tarif » (Adulte)
          const sorted = [...buyable].sort(
            (a, b) => (a.DisplaySequence ?? 999) - (b.DisplaySequence ?? 999)
          )
          setSessionTickets(sorted)
          const primary = sorted[0]
          if (primary) {
            setTicketUnitPrice(primary.PriceInCents)
            setPriceLabel(primary.Description || null)
            setPriceSource('veezi')
            return
          }
        }
      } catch {
        // canal CINEP indisponible sur cette séance — on retombe sur le prix enregistré
      }

      // 2) Prix enregistré (Supabase) — même source que l'étape paiement
      const pcParam = session?.PriceCardName
        ? `&priceCardName=${encodeURIComponent(session.PriceCardName)}`
        : ''
      const res = await fetch(`/api/prices?sessionId=${sessionId}${pcParam}`)
      const { price, label, source, tickets } = await res.json()

      // Une grille par tranche d'âge : même traitement que la grille live.
      if (Array.isArray(tickets) && tickets.length) {
        setSessionTickets(tickets)
        setTicketUnitPrice(tickets[0].PriceInCents)
        setPriceSource(source)
        return
      }
      if (price != null) {
        setTicketUnitPrice(price)
        if (label) setPriceLabel(label)
        setPriceSource(source)
      }
    } catch {
      // aucune source — le prix reste null, on affichera la catégorie
    } finally {
      setLoadingPrice(false)
    }
  }

  async function selectSession(session) {
    // Séance déjà refermée — cas d'un lien profond périmé, ou d'un clic tombé
    // à la seconde près. On la garde sélectionnée : l'écran qui suit explique
    // la fermeture, ce qu'un retour muet vers la liste ne ferait pas.
    if (!isOpenForSale(session)) {
      if (!selectedFilm) {
        const film = films.find(f => String(f.Id) === String(session.FilmId))
        if (film) setSelectedFilm(film)
      }
      setSelectedSession(session)
      setSelectedSeats([])
      setStep('seats')
      return
    }

    // Si on clique depuis la liste des films sans passer par selectFilm(),
    // selectedFilm est null → page blanche. On le résout ici via FilmId.
    if (!selectedFilm) {
      const film = films.find(f => String(f.Id) === String(session.FilmId))
      if (film) setSelectedFilm(film)
    }
    setSelectedSession(session)
    setSelectedSeats([])
    setSeatPlanData(null)
    setSeatPlanError(null)
    setError(null)
    setTicketUnitPrice(null)
    setPriceLabel(null)
    setSessionTickets(null)
    setPriceSource(null)
    setStep('seats')

    setLoadingSeats(true)
    resolveSessionPrice(session)  // résout le tarif (Connect → prix enregistré Supabase)
    try {
      const data = await connectGet(
        `/RESTData.svc/cinemas/${CINEMA_ID}/sessions/${session.Id}/seat-plan`
      )
      if (data.ResponseCode !== 0 && data.ResponseCode != null) {
        setSeatPlanError(data.ErrorDescription ?? t('seats.planErrorCode', { code: data.ResponseCode }))
      } else {
        setSeatPlanData(data)
      }
    } catch (e) {
      setSeatPlanError(e.message)
    } finally {
      setLoadingSeats(false)
    }
  }

  function toggleSeat(seatObj, isCurrentlySelected) {
    setSelectedSeats(prev =>
      isCurrentlySelected
        ? prev.filter(s => s.displayKey !== seatObj.displayKey)
        : [...prev, seatObj]
    )
  }

  // Modifie la quantité d'un type de billet en respectant la contrainte
  // 0 ≤ total ≤ nombre de places sélectionnées.
  function adjustTicket(code, delta) {
    setTicketCounts(prev => {
      const total = Object.values(prev).reduce((s, n) => s + n, 0)
      const current = prev[code] || 0
      const nextVal = current + delta
      if (nextVal < 0) return prev
      if (delta > 0 && total >= selectedSeats.length) return prev  // plus de places à attribuer
      return { ...prev, [code]: nextVal }
    })
  }

  function goToPayment() {
    if (selectedSeats.length === 0) return
    // TODO: réactiver l'intégration paiement (temporairement désactivé)
    // async function goToPayment() {
    //   setError(null)
    //   setLoadingOrder(true)
    //   setOrderResult(null)
    //   try {
    //     const result = await connectPost('/RESTTicketing.svc/order/tickets', {
    //       UserSessionId: cartIdRef.current,
    //       CinemaId: CINEMA_ID,
    //       SessionId: String(selectedSession.Id),
    //       TicketTypes: [
    //         { TicketTypeCode: '0000000001', Qty: selectedSeats.length, PriceInCents: -1 }
    //       ],
    //       SelectedSeats: selectedSeats.map(s => ({
    //         AreaCategoryCode: s.areaCategoryCode,
    //         AreaNumber: s.areaNumber,
    //         RowIndex: s.rowIndex,
    //         ColumnIndex: s.columnIndex,
    //       })),
    //       UserSelectedSeatingSupported: true,
    //       ReturnOrder: true,
    //       BookingMode: 0,
    //     })
    //     if (result.Result && result.Result !== 0) {
    //       setError(result.ErrorDescription ?? `Erreur commande (code ${result.Result})`)
    //       return
    //     }
    //     setOrderResult(result)
    //   } catch (e) {
    //     setError(e.message)
    //     return
    //   } finally {
    //     setLoadingOrder(false)
    //   }
    // }
    setStep('payment')
  }

  function confirmPayment() {
    if (!phoneNumber.trim()) return
    // TODO: réactiver l'intégration paiement (temporairement désactivé)
    // async function confirmPayment() {
    //   setError(null)
    //   setLoadingPayment(true)
    //   try {
    //     const orderId = orderResult?.Order?.OrderId ?? orderResult?.OrderId
    //     await connectPost('/RESTTicketing.svc/order/payment', {
    //       UserSessionId: cartIdRef.current,
    //       OrderId: orderId,
    //       CinemaId: CINEMA_ID,
    //       CardTypeCode: paymentMethod,
    //       PrimaryAmount: orderResult?.Order?.TotalPrice ?? 0,
    //     })
    //   } catch {
    //     // ignorer l'erreur pour l'instant
    //   } finally {
    //     setLoadingPayment(false)
    //   }
    // }
    setStep('done')
  }

  function reset() {
    setStep('films')
    setSelectedFilm(null)
    setSelectedSession(null)
    setSelectedSeats([])
    setSeatPlanData(null)
    setSeatPlanError(null)
    setOrderResult(null)
    setBookingResult(null)
    setPhoneNumber('')
    setError(null)
    cartIdRef.current = generateCartId()
  }

  const totalCents = orderResult?.Order?.TotalPrice ?? null

  // ── Composant hero réutilisable ──────────────────────────────────────────────
  function FilmHero({ film, onBack, backLabel, extraMeta, children }) {
    const backdrop = filmBackdrop(film)
    const poster   = filmPoster(film)
    return (
      <div className="film-detail-page">
        {error && <div className="error-banner fd-error">⚠ {error}</div>}

        <div
          className="film-hero"
          style={backdrop ? { backgroundImage: `url(${backdrop})` } : {}}
        >
          <div className="film-hero-nav">
            <button className="film-back-link" onClick={onBack}>{backLabel}</button>
          </div>

          <div className="film-hero-inner">
            <div className="film-hero-poster">
              {poster
                ? <img src={poster} alt={film.Title} />
                : <div className="film-hero-poster-placeholder">{film.Title.charAt(0)}</div>
              }
            </div>

            <div className="film-hero-info">
              <h1>{film.Title}</h1>
              <span className="now-playing-badge">{t('film.nowPlaying')}</span>

              <div className="film-rating-row">
                {ratingLabel(film.Rating, t) && (
                  <span className="rating-badge" title={ratingTitle(film.Rating, t)}>
                    {ratingLabel(film.Rating, t)}
                  </span>
                )}
                {film.Advisory && <span className="advisory-text">{film.Advisory}</span>}
              </div>

              {(film.Duration || film.Genre) && (
                <p className="film-meta-hero">
                  {film.Duration && formatDuration(film.Duration, lang)}
                  {film.Duration && film.Genre && ' | '}
                  {genreLabel(film.Genre, t)}
                </p>
              )}

              {extraMeta && <p className="film-hero-extra-meta">{extraMeta}</p>}

              <button className="trailer-btn">
                <span className="trailer-play-icon">
                  <svg viewBox="0 0 20 20" fill="currentColor" width="10" height="10">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                </span>
                {t('film.trailer')}
              </button>
            </div>
          </div>
        </div>

        <div className="film-sessions-section">
          <div className="film-sessions-inner">
            {children}
          </div>
        </div>
      </div>
    )
  }

  // ── URL profonde en cours de résolution ──────────────────────────────────────
  if (pendingRoute && pendingRoute.step !== 'films') {
    return <RestoringSkeleton step={pendingRoute.step} />
  }

  // ── Séance refermée ──────────────────────────────────────────────────────────
  // Trois chemins mènent ici : un lien partagé vers une séance dont le délai
  // est passé, un onglet laissé ouvert pendant que l'heure avançait, et le
  // retour du navigateur vers un écran qui n'a plus lieu d'être.
  //
  // La confirmation n'est jamais interceptée : un achat conclu appartient au
  // client, l'horloge ne le lui reprend pas.
  if (selectedFilm && selectedSession
      && (step === 'seats' || step === 'payment')
      && !isOpenForSale(selectedSession)) {
    const backToShowtimes = () => {
      setSelectedSession(null)
      setSelectedSeats([])
      setSeatPlanData(null)
      setStep('sessions')
    }
    return (
      <FilmHero
        film={selectedFilm}
        onBack={backToShowtimes}
        backLabel={t('film.backToShowtimes')}
        extraMeta={formatTime(sessionTime(selectedSession))}
      >
        <div className="sale-closed" role="status">
          <h2 className="sale-closed-title">{t('ventes.closedTitle')}</h2>
          <p className="sale-closed-text">
            {/* La séance a-t-elle commencé, ou seulement franchi le délai ?
                « Elle commence bientôt » serait faux une heure après le début,
                et sans délai réglé il n'y a pas de délai à nommer. */}
            {(cutoffMinutes > 0 && new Date(sessionTime(selectedSession)).getTime() > now)
              ? t('ventes.closedText', {
                  hour:  formatHour(sessionTime(selectedSession)),
                  delay: formatDuration(cutoffMinutes, lang),
                })
              : t('ventes.closedStarted', { hour: formatHour(sessionTime(selectedSession)) })}
          </p>
          <p className="sale-closed-desk">{t('ventes.closedDesk')}</p>
          <button className="btn-primary sale-closed-cta" onClick={backToShowtimes}>
            {t('ventes.closedCta')}
          </button>
        </div>
      </FilmHero>
    )
  }

  // ── Étape 3 — Plan de salle ───────────────────────────────────────────────────
  if (step === 'seats' && selectedFilm) {
    const screenLabel = selectedSession?.ScreenName || t('film.screenFallback', { id: selectedSession?.ScreenId })
    const sessionLabel = formatTime(sessionTime(selectedSession))

    // Grille tarifaire live disponible ? (plusieurs types de billets à répartir)
    const hasTicketPicker = Array.isArray(sessionTickets) && sessionTickets.length > 0
    const assignedCount = hasTicketPicker
      ? sessionTickets.reduce((s, t) => s + (ticketCounts[t.TicketTypeCode] || 0), 0)
      : selectedSeats.length
    const ticketsTotalCents = hasTicketPicker
      ? sessionTickets.reduce((s, t) => s + (ticketCounts[t.TicketTypeCode] || 0) * t.PriceInCents, 0)
      : (ticketUnitPrice != null ? ticketUnitPrice * selectedSeats.length : null)
    const allSeatsAssigned = !hasTicketPicker || assignedCount === selectedSeats.length

    return (
      <FilmHero
        film={selectedFilm}
        onBack={() => setStep('sessions')}
        backLabel={t('film.backToShowtimes')}
        extraMeta={`${screenLabel} · ${sessionLabel}`}
      >
        <AchatBand />
        <h2 className="sessions-title">
          <span className="aide-titre-ligne">
            {t('seats.title')}
            <Aide titre={t('aide.placesTitre')} ancre="places">
              <p>{t('aide.placesTexte')}</p>
            </Aide>
          </span>
        </h2>
        <hr className="section-divider" />

        {loadingSeats && <SeatMapSkeleton />}

        {seatPlanError && (
          <div className="seatmap-error">
            <p>{t('seats.loadError')}</p>
            <p style={{ marginTop: 6, fontSize: '0.82rem', opacity: 0.7 }}>{seatPlanError}</p>
          </div>
        )}

        {!loadingSeats && (
          <SeatMap
            screenId={selectedSession?.ScreenId}
            screenName={selectedSession?.ScreenName}
            seatPlanData={seatPlanData}
            selectedSeats={selectedSeats}
            onToggleSeat={toggleSeat}
          />
        )}

        {!loadingSeats && hasTicketPicker && selectedSeats.length > 0 && (
          <div className="ticket-picker">
            <div className="ticket-picker-head">
              <span className="ticket-picker-eyebrow aide-titre-ligne">
                {t('seats.ticketType')}
                <Aide titre={t('aide.billetsTitre')} ancre="places">
                  <p>{t('aide.billetsTexte')}</p>
                </Aide>
              </span>
              <span className={`ticket-picker-counter ${allSeatsAssigned ? 'is-complete' : ''}`}>
                {t('seats.assigned', { assigned: assignedCount, total: selectedSeats.length, count: selectedSeats.length })}
              </span>
            </div>
            <div className="ticket-type-list">
              {sessionTickets.map(t => {
                const qty = ticketCounts[t.TicketTypeCode] || 0
                return (
                  <div key={t.TicketTypeCode} className={`ticket-type-row ${qty > 0 ? 'is-active' : ''}`}>
                    <div className="ticket-type-desc">
                      <span className="ticket-type-name">{ticketLabel(t)}</span>
                      <span className="ticket-type-price">{formatPrice(t.PriceInCents)}</span>
                    </div>
                    <div className="ticket-stepper">
                      <button
                        type="button"
                        className="ticket-step-btn"
                        onClick={() => adjustTicket(t.TicketTypeCode, -1)}
                        disabled={qty === 0}
                        aria-label={tr('seats.removeTicket', { type: ticketLabel(t) })}
                      >−</button>
                      <span className="ticket-step-qty">{qty}</span>
                      <button
                        type="button"
                        className="ticket-step-btn"
                        onClick={() => adjustTicket(t.TicketTypeCode, 1)}
                        disabled={assignedCount >= selectedSeats.length}
                        aria-label={tr('seats.addTicket', { type: ticketLabel(t) })}
                      >+</button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="ticket-picker-foot">
              <span className="ticket-picker-total-label">{t('seats.ticketTotal')}</span>
              <span className="ticket-picker-total">
                {ticketsTotalCents != null ? formatPrice(ticketsTotalCents) : '—'}
              </span>
            </div>

            {/* Tant que le back-office ne publie pas ses tarifs, le montant
                affiché est celui de l'affiche : on le dit plutôt que de le
                laisser passer pour un prix arrêté. */}
            {/* La grille du back-office n'a pas répondu : le montant vient de
                l'affiche officielle. On le dit — un prix de référence n'est
                pas un prix arrêté, et le client le découvrirait à la caisse. */}
            {priceSource === 'reference' && (
              <AideNote
                titre={t('aide.tarifAbsentTitre')}
                ancre="faq"
                className="ticket-picker-aide"
              >
                {t('aide.tarifAbsentTexte')}
              </AideNote>
            )}
          </div>
        )}

        {/* Dernier écran avant le formulaire de paiement : le voyant se pose
            au ras du bouton « Continuer », là où la décision se prend. */}
        {!loadingSeats && selectedSeats.length > 0 && (
          <FinalSaleNotice when="before" className="seats-final-sale" />
        )}

        {!loadingSeats && (
          <div className={`booking-bar ${selectedSeats.length > 0 ? 'visible' : ''}`}>
            <div className="booking-bar-info">
              {selectedSeats.length === 0 ? (
                <>
                  <svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15" style={{ flexShrink: 0, opacity: 0.4 }}>
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <span className="booking-bar-hint">{t('seats.hint')}</span>
                </>
              ) : (
                <>
                  <span className="booking-seats-count">
                    {t('seats.seatCount', { n: selectedSeats.length, count: selectedSeats.length })}
                  </span>
                  <span className="booking-bar-sep">—</span>
                  {/* Même ordre que le bandeau sous l'écran : rangée puis
                      numéro. Deux relevés de la même chose se lisent pareil. */}
                  <span className="seats-list">{sortByPlanOrder(selectedSeats).map(s => s.displayKey).join(', ')}</span>
                  <span className="booking-bar-sep">—</span>
                  {loadingPrice && ticketsTotalCents == null ? (
                    <span className="booking-bar-tarif">{t('seats.calculating')}</span>
                  ) : ticketsTotalCents != null ? (
                    <span className="booking-bar-price">
                      {!hasTicketPicker && selectedSeats.length > 1 && (
                        <span className="booking-bar-unit">
                          {formatPrice(ticketUnitPrice)} × {selectedSeats.length} =&nbsp;
                        </span>
                      )}
                      {formatPrice(ticketsTotalCents)}
                    </span>
                  ) : (priceLabel || selectedSession?.PriceCardName) ? (
                    <span className="booking-bar-tarif">{priceLabel || selectedSession.PriceCardName}</span>
                  ) : null}
                </>
              )}
            </div>
            <button
              className="btn-primary booking-bar-cta"
              disabled={selectedSeats.length === 0 || loadingOrder || !allSeatsAssigned}
              onClick={goToPayment}
            >
              {loadingOrder ? t('seats.preparing') : t('seats.continue')}
            </button>
          </div>
        )}
      </FilmHero>
    )
  }

  // ── Étape 2 — Détail film + séances ─────────────────────────────────────────
  if (step === 'sessions' && selectedFilm) {
    const resolu = synopses[String(selectedFilm.Id)]
    const fullSynopsis = resolu?.texte || selectedFilm.Synopsis || selectedFilm.ShortSynopsis || ''
    const hasDetails = selectedFilm.Director || selectedFilm.Cast || fullSynopsis

    return (
      <FilmHero
        film={selectedFilm}
        onBack={() => setStep('films')}
        backLabel={t('film.backToMovies')}
      >
        <AchatBand />
        <h2 className="sessions-title">{t('sessions.title')}</h2>
        <hr className="section-divider" />

        {/* Plus rien en vente, mais le film joue encore aujourd'hui : le dire.
            « Aucune séance » serait faux — c'est la vente en ligne qui est
            refermée, pas la salle qui est fermée. */}
        {allSessionsByDate.length === 0
          ? (closedSessionsForFilm.length > 0
              ? <SaleClosedNote count={closedSessionsForFilm.length} delay={cutoffMinutes} />
              : <p className="empty-state">{t('sessions.empty')}</p>)
          : <BuyHint />
        }

        {allSessionsByDate.map(({ day, sessions }) => (
          <div key={day} className="session-day-group">
            <h3 className="session-day-label">{formatDateHeader(day)}</h3>
            <div className="film-sessions">
              {sessions.map(s => (
                <SessionButton
                  key={s.Id}
                  session={s}
                  hour={formatHour(sessionTime(s))}
                  onSelect={selectSession}
                />
              ))}
            </div>
          </div>
        ))}

        {hasDetails && (
          <div className="film-details-section">
            <hr className="section-divider film-details-divider" />
            <h2 className="film-details-title">{t('film.details')}</h2>

            {selectedFilm.Director && (
              <p className="film-details-row">
                <span className="film-details-label">{t('film.directedBy')}</span>
                <span className="film-details-value">{selectedFilm.Director}</span>
              </p>
            )}

            {selectedFilm.Cast && (
              <p className="film-details-row">
                <span className="film-details-label">{t('film.cast')}</span>
                <span className="film-details-value">{selectedFilm.Cast}</span>
              </p>
            )}

            <RichText className="film-details-synopsis" text={fullSynopsis} lang={resolu?.langue} />
          </div>
        )}
      </FilmHero>
    )
  }

  // ── Étape 4 — Paiement ───────────────────────────────────────────────────────
  if (step === 'payment' && selectedFilm) {
    return (
      <PaymentForm
        film={selectedFilm}
        session={selectedSession}
        seats={selectedSeats}
        ticketUnitPrice={ticketUnitPrice}
        ticketBreakdown={ticketBreakdown}
        totalOverrideCents={breakdownTotalCents}
        sessionLabel={formatTime(sessionTime(selectedSession))}
        sessionISOTime={sessionTime(selectedSession)}
        formatPrice={formatPrice}
        onConfirm={booking => {
          setBookingResult(booking)
          // La confirmation prend la place du formulaire dans l'historique :
          // un retour ne doit pas ramener sur un paiement déjà encaissé.
          replaceNextRef.current = true
          setStep('done')
        }}
        onBack={() => setStep('seats')}
      />
    )
  }

  return (
    <>
      {step === 'films' && (
        <HeroSlider films={heroFilms} loading={loading} synopses={synopses} onSelectFilm={selectFilm} />
      )}

    <div className="page-container">

      {error && <div className="error-banner">⚠ {error}</div>}

      {/* ══════════════════════════════════════════════════════════
          ÉTAPE 1 — Films à l'affiche
      ══════════════════════════════════════════════════════════ */}
      {step === 'films' && (
        <>
          {/* Header "Horaires et billets" */}
          {openDropdown && (
            <div className="dropdown-overlay" onClick={() => setOpenDropdown(null)} />
          )}
          <div className="section-header">
            <h1 className="section-title">{t('home.title')}</h1>
            <div className="section-filters">

              {/* Filtre 1 — Groupement */}
              <div className="filter-dropdown">
                <button
                  className={`filter-btn ${openDropdown === 'group' ? 'open' : ''}`}
                  onClick={() => setOpenDropdown(o => o === 'group' ? null : 'group')}
                >
                  <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                  </svg>
                  {groupBy === 'jour' ? t('home.byDay') : t('home.byMovie')}
                  <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11" className={`chevron ${openDropdown === 'group' ? 'up' : ''}`}>
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
                {openDropdown === 'group' && (
                  <div className="filter-menu">
                    <button
                      className={`filter-menu-item ${groupBy === 'jour' ? 'active' : ''}`}
                      onClick={() => { setGroupBy('jour'); setOpenDropdown(null) }}
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" className="menu-icon"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" /></svg>
                      {t('home.byDay')}
                      {groupBy === 'jour' && <span className="check">✓</span>}
                    </button>
                    <button
                      className={`filter-menu-item ${groupBy === 'film' ? 'active' : ''}`}
                      onClick={() => { setGroupBy('film'); setOpenDropdown(null) }}
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" className="menu-icon"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm3 2h6v4H7V5zm8 8v2h1v-2h-1zm-2-2H7v4h6v-4zm2 0h1V9h-1v2zm1-4V5h-1v2h1zM5 5H4v2h1V5zM4 9H3v2h1V9zm0 4H3v2h1v-2z" clipRule="evenodd" /></svg>
                      {t('home.byMovie')}
                      {groupBy === 'film' && <span className="check">✓</span>}
                    </button>
                  </div>
                )}
              </div>

              {/* Filtre 2 — Tri */}
              <div className="filter-dropdown">
                <button
                  className={`filter-btn ${openDropdown === 'sort' ? 'open' : ''}`}
                  onClick={() => setOpenDropdown(o => o === 'sort' ? null : 'sort')}
                >
                  {sortBy === 'heure'  && t('home.byShowtime')}
                  {sortBy === 'alpha'  && t('home.alphabetical')}
                  {sortBy === 'recent' && t('home.newest')}
                  <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11" className={`chevron ${openDropdown === 'sort' ? 'up' : ''}`}>
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
                {openDropdown === 'sort' && (
                  <div className="filter-menu">
                    <button
                      className={`filter-menu-item ${sortBy === 'heure' ? 'active' : ''}`}
                      onClick={() => { setSortBy('heure'); setOpenDropdown(null) }}
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" className="menu-icon"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
                      {t('home.byShowtime')}
                      {sortBy === 'heure' && <span className="check">✓</span>}
                    </button>
                    <button
                      className={`filter-menu-item ${sortBy === 'alpha' ? 'active' : ''}`}
                      onClick={() => { setSortBy('alpha'); setOpenDropdown(null) }}
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" className="menu-icon"><path fillRule="evenodd" d="M3 3a1 1 0 000 2h11a1 1 0 100-2H3zm0 4a1 1 0 000 2h7a1 1 0 100-2H3zm0 4a1 1 0 000 2h4a1 1 0 100-2H3zm0 4a1 1 0 000 2h11a1 1 0 100-2H3z" clipRule="evenodd" /></svg>
                      {t('home.alphabetical')}
                      {sortBy === 'alpha' && <span className="check">✓</span>}
                    </button>
                    <button
                      className={`filter-menu-item ${sortBy === 'recent' ? 'active' : ''}`}
                      onClick={() => { setSortBy('recent'); setOpenDropdown(null) }}
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" className="menu-icon"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                      {t('home.newest')}
                      {sortBy === 'recent' && <span className="check">✓</span>}
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>

          <hr className="section-divider" />

          {/* Sélecteur de dates — masqué en mode PAR FILM.
              Pendant le chargement il garde sa place : les dates arrivent avec
              le catalogue, et une rangée qui s'insère au dernier moment pousse
              toute la liste vers le bas juste au moment où on la lit. */}
          {groupBy === 'jour' && (
            loading
              ? <DatePickerSkeleton />
              : availableDays.length > 0 && (
                  <DatePicker
                    days={availableDays}
                    selected={selectedDay}
                    onSelect={chooseDay}
                  />
                )
          )}

          {/* Le bandeau d'achat dit la nature de la vente dès le premier écran,
              avant même qu'un horaire soit cliqué. Son texte ne dépend pas de
              l'API : on l'affiche pendant l'attente plutôt que d'en fantômer
              deux blocs qui repousseraient ensuite la liste. */}
          {(loading || visibleFilms.length > 0) && (
            <>
              <AchatBand className="home-achat-band" />
              <BuyHint />
            </>
          )}

          {loading && <FilmsListSkeleton />}

          {!loading && (
            <div className="films-list">
              {/* Une erreur réseau parle déjà dans son bandeau : y ajouter
                  « aucun film programmé » annoncerait une salle fermée alors
                  que c'est la requête qui a échoué. */}
              {visibleFilms.length === 0 && !error && (
                anySessionsOnDay.length > 0
                  ? <SaleClosedNote count={anySessionsOnDay.length} delay={cutoffMinutes} />
                  : <p className="empty-state">{t('home.emptyDay')}</p>
              )}

              {visibleFilms.map((film, idx) => {
                const filmSessions = sessionsByDay.filter(s => String(s.FilmId) === String(film.Id))
                const resolu = synopses[String(film.Id)]
                const synopsis = parseSynopsis(resolu?.texte || film.Synopsis || film.ShortSynopsis)
                const isExpanded = expandedFilms.has(film.Id)
                // La coupe porte sur le texte analysé, pas sur la chaîne brute :
                // un titre de film en italique ne se retrouve jamais à cheval.
                const short = truncateSynopsis(synopsis, 180)
                const needsTruncation = short.truncated
                const displayedSynopsis = isExpanded ? synopsis : short.paragraphs

                function toggleExpand(e) {
                  e.stopPropagation()
                  setExpandedFilms(prev => {
                    const next = new Set(prev)
                    if (next.has(film.Id)) next.delete(film.Id)
                    else next.add(film.Id)
                    return next
                  })
                }

                return (
                  // --i échelonne l'apparition : les fiches se posent dans
                  // l'ordre de lecture au lieu de remplacer le squelette d'un
                  // bloc. Le décalage est aussi celui du squelette (0,12 s),
                  // de sorte que le relais se voit à peine.
                  <div key={film.Id} className="film-entry" style={{ '--i': Math.min(idx, 6) }}>
                    <hr className="section-divider" />
                    <div className="film-row">
                      {/* Poster */}
                      <div className="film-poster-wrap" onClick={() => selectFilm(film)}>
                        {filmPoster(film)
                          ? <img src={filmPoster(film)} alt={film.Title} loading="lazy" />
                          : (
                            <div className="film-poster-placeholder">
                              {film.Title.charAt(0)}
                            </div>
                          )
                        }
                        <div className="play-btn-overlay">
                          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                      </div>

                      {/* Infos */}
                      <div className="film-info">
                        <h2 className="film-title" onClick={() => selectFilm(film)}>
                          {film.Title}
                        </h2>

                        <p className="film-meta">
                          {ratingLabel(film.Rating, t) && (
                            <span title={ratingTitle(film.Rating, t)}>{ratingLabel(film.Rating, t)}</span>
                          )}
                          {ratingLabel(film.Rating, t) && film.Duration && <span> | </span>}
                          {film.Duration && <span>{formatDuration(film.Duration, lang)}</span>}
                        </p>

                        <RichText
                          className="film-synopsis"
                          lang={resolu?.langue}
                          paragraphs={displayedSynopsis}
                          trailing={needsTruncation && (
                            <>
                              {!isExpanded && '… '}
                              <button className="synopsis-more" onClick={toggleExpand}>
                                {isExpanded ? t('home.less') : t('home.more')}
                              </button>
                            </>
                          )}
                        />

                        {/* Boutons de séances */}
                        <div className="film-sessions">
                          {filmSessions.map(s => (
                            <SessionButton
                              key={s.Id}
                              session={s}
                              hour={formatHour(sessionTime(s))}
                              onSelect={selectSession}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}

              {visibleFilms.length > 0 && <hr className="section-divider" />}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════
          ÉTAPE 2 — Séances du film
      ══════════════════════════════════════════════════════════ */}
      {step === 'sessions' && (
        <>
          <div className="section-header">
            <h1 className="section-title">{t('sessions.title')}</h1>
          </div>
          <hr className="section-divider" />

          {availableDays.length > 0 && (
            <DatePicker
              days={availableDays}
              selected={selectedDay}
              onSelect={chooseDay}
            />
          )}

          <hr className="section-divider" />

          <button className="back-btn" onClick={() => setStep('films')}>{t('film.backToMovies')}</button>

          {selectedFilm && (
            <div className="film-detail-header">
              {filmPoster(selectedFilm) && (
                <img
                  src={filmPoster(selectedFilm)}
                  alt={selectedFilm.Title}
                  className="film-detail-poster"
                />
              )}
              <div className="film-detail-info">
                <h2>{selectedFilm.Title}</h2>
                <p className="meta">
                  {selectedFilm.Duration && formatDuration(selectedFilm.Duration, lang)}
                  {selectedFilm.Duration && ratingLabel(selectedFilm.Rating, t) && ' · '}
                  {ratingLabel(selectedFilm.Rating, t)}
                </p>
              </div>
            </div>
          )}

          {sessionsForFilm.length === 0
            ? (closedSessionsForFilm.length > 0
                ? <SaleClosedNote count={closedSessionsForFilm.length} delay={cutoffMinutes} />
                : <p className="empty-state">{t('sessions.emptyDay')}</p>)
            : (
              <div className="sessions-grid">
                {sessionsForFilm.map(s => (
                  <div key={s.Id} className="session-card" onClick={() => selectSession(s)}>
                    <div className="time">{formatHour(sessionTime(s))}</div>
                    <div className="screen">{t('sessions.screen', { name: s.ScreenName || s.ScreenId })}</div>
                    <div className="avail">
                      {s.SeatsAvailable != null
                        ? t('sessions.seatsAvailable', { n: s.SeatsAvailable })
                        : '—'}
                    </div>
                    {s.FilmFormat && <div className="screen" style={{ marginTop: 4 }}>{s.FilmFormat}</div>}
                  </div>
                ))}
              </div>
            )
          }
        </>
      )}

      {/* ══════════════════════════════════════════════════════════
          ÉTAPE 5 — Confirmation
      ══════════════════════════════════════════════════════════ */}
      {step === 'done' && (
        <BookingConfirmation
          booking={bookingResult}
          filmTitle={selectedFilm?.Title}
          sessionLabel={formatTime(sessionTime(selectedSession))}
          sessionISOTime={sessionTime(selectedSession)}
          screenName={selectedSession?.ScreenName || t('film.screenFallback', { id: selectedSession?.ScreenId })}
          seats={selectedSeats}
          ticketBreakdown={ticketBreakdown}
          totalCents={bookingResult?.total_amount_cents ?? breakdownTotalCents ?? (ticketUnitPrice != null ? ticketUnitPrice * selectedSeats.length : null)}
          onReset={reset}
        />
      )}

    </div>
    </>
  )
}
