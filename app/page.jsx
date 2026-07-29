'use client'

import { useState, useEffect, useRef } from 'react'
import SeatMap from '../components/SeatMap'
import HeroSlider from '../components/HeroSlider'
import PaymentForm from '../components/PaymentForm'
import BookingConfirmation from '../components/BookingConfirmation'
import { useI18n } from '@/lib/i18n'

// ─── Config ───────────────────────────────────────────────────────────────────
const CINEMA_ID = '0000000309'
const TZ = 'Etc/GMT-3'

function fixImageUrl(url) {
  if (!url) return null
  if (url.startsWith('https://cdn.eu.veezi.com/')) return url
  const fixed = url.replace(/^https?:\/\/\//, 'https://www.cinepax.mg/')
  return `/api/image?url=${encodeURIComponent(fixed)}`
}

function filmPoster(film) {
  return fixImageUrl(film?.FilmPosterUrl || film?.FilmPosterThumbnailUrl)
}

function filmBackdrop(film) {
  return fixImageUrl(film?.BackdropImageUrl || film?.FilmPosterUrl)
}

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

// ─── Skeleton: liste de films ─────────────────────────────────────────────────
function FilmsListSkeleton() {
  return (
    <div className="sk-films-list">
      {[0, 1, 2].map(i => (
        <div key={i} className="sk-film-card" style={{ '--sk-delay': `${i * 0.12}s` }}>
          <hr className="section-divider" />
          <div className="sk-film-inner">
            {/* Poster */}
            <div className="sk-poster sk-shine" />

            {/* Infos */}
            <div className="sk-info">
              {/* Genre badge */}
              <div className="sk-badge-row">
                <div className="sk-badge sk-shine" />
                <div className="sk-badge sk-shine" style={{ width: 52 }} />
              </div>
              {/* Titre */}
              <div className="sk-shine sk-title-line" />
              <div className="sk-shine sk-title-line" style={{ width: '45%', marginTop: 6 }} />
              {/* Meta */}
              <div className="sk-shine sk-meta-line" style={{ marginTop: 14 }} />
              {/* Synopsis */}
              <div className="sk-synopsis">
                <div className="sk-shine sk-syn-line" />
                <div className="sk-shine sk-syn-line" style={{ width: '88%' }} />
                <div className="sk-shine sk-syn-line" style={{ width: '65%' }} />
              </div>
              {/* Boutons séances */}
              <div className="sk-sessions-row">
                {[72, 68, 74, 68].map((w, j) => (
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

// ─── Page principale ──────────────────────────────────────────────────────────
export default function Home() {
  const { t, locale, moneyLocale } = useI18n()
  const tr = t   // alias utilisable là où `t` est masqué (ex: sessionTickets.map(t => …))
  const formatHour       = (s) => formatHourL(s, locale)
  const formatTime       = (s) => formatTimeL(s, locale)
  const formatPrice      = (c) => formatPriceL(c, moneyLocale)
  const formatDateHeader = (d) => formatDateHeaderL(d, locale)

  const [step, setStep] = useState('films')

  const [films, setFilms] = useState([])
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
  const [loadingPrice, setLoadingPrice] = useState(false)
  const [bookingResult, setBookingResult] = useState(null)

  const [groupBy, setGroupBy] = useState('jour')   // 'jour' | 'film'
  const [sortBy, setSortBy] = useState('heure')     // 'heure' | 'alpha' | 'recent'
  const [openDropdown, setOpenDropdown] = useState(null) // 'group' | 'sort' | null
  const [expandedFilms, setExpandedFilms] = useState(new Set())

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const cartIdRef = useRef(generateCartId())

  useEffect(() => {
    setLoading(true)
    Promise.all([veeziGet('/v4/film'), veeziGet('/v1/session')])
      .then(([filmsData, sessionsData]) => {
        const now = new Date()
        const futureSessions = (Array.isArray(sessionsData) ? sessionsData : [sessionsData])
          .filter(s => new Date(sessionTime(s)) > now)
          .sort((a, b) => new Date(sessionTime(a)) - new Date(sessionTime(b)))

        const filmIdsWithSessions = new Set(futureSessions.map(s => String(s.FilmId)))
        const upcomingFilms = (Array.isArray(filmsData) ? filmsData : [filmsData])
          .filter(f => filmIdsWithSessions.has(String(f.Id)))

        setFilms(upcomingFilms)
        setAllSessions(futureSessions)

        if (futureSessions.length > 0) {
          setSelectedDay(toDateKey(sessionTime(futureSessions[0])))
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

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

  const availableDays = [...new Set(allSessions.map(s => toDateKey(sessionTime(s))))].sort()

  const sessionsByDay = (groupBy === 'film' || !selectedDay)
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
  const heroFilms = [...films].sort((a, b) => {
    const aFirst = allSessions.find(s => String(s.FilmId) === String(a.Id))
    const bFirst = allSessions.find(s => String(s.FilmId) === String(b.Id))
    if (!aFirst) return 1
    if (!bFirst) return -1
    return new Date(sessionTime(aFirst)) - new Date(sessionTime(bFirst))
  })

  const sessionsForFilm = selectedFilm
    ? sessionsByDay.filter(s => String(s.FilmId) === String(selectedFilm.Id))
    : []

  // Toutes les séances du film sélectionné, groupées par jour
  const allSessionsForFilm = selectedFilm
    ? allSessions.filter(s => String(s.FilmId) === String(selectedFilm.Id))
    : []

  const allSessionsByDate = availableDays
    .filter(day => allSessionsForFilm.some(s => toDateKey(sessionTime(s)) === day))
    .map(day => ({
      day,
      sessions: allSessionsForFilm.filter(s => toDateKey(sessionTime(s)) === day),
    }))

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
  // Met à jour ticketUnitPrice (en centimes) dès qu'une source répond.
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
      const { price, label } = await res.json()
      if (price != null) {
        setTicketUnitPrice(price)
        if (label) setPriceLabel(label)
      }
    } catch {
      // aucune source — le prix reste null, on affichera la catégorie
    } finally {
      setLoadingPrice(false)
    }
  }

  async function selectSession(session) {
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
                {film.Rating   && <span className="rating-badge">{film.Rating}</span>}
                {film.Advisory && <span className="advisory-text">{film.Advisory}</span>}
              </div>

              {(film.Duration || film.Genre) && (
                <p className="film-meta-hero">
                  {film.Duration && `${film.Duration} ${t('home.mins')}`}
                  {film.Duration && film.Genre && ' | '}
                  {film.Genre}
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
        <h2 className="sessions-title">{t('seats.title')}</h2>
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
              <span className="ticket-picker-eyebrow">{t('seats.ticketType')}</span>
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
                      <span className="ticket-type-name">{t.Description}</span>
                      <span className="ticket-type-price">{formatPrice(t.PriceInCents)}</span>
                    </div>
                    <div className="ticket-stepper">
                      <button
                        type="button"
                        className="ticket-step-btn"
                        onClick={() => adjustTicket(t.TicketTypeCode, -1)}
                        disabled={qty === 0}
                        aria-label={tr('seats.removeTicket', { type: t.Description })}
                      >−</button>
                      <span className="ticket-step-qty">{qty}</span>
                      <button
                        type="button"
                        className="ticket-step-btn"
                        onClick={() => adjustTicket(t.TicketTypeCode, 1)}
                        disabled={assignedCount >= selectedSeats.length}
                        aria-label={tr('seats.addTicket', { type: t.Description })}
                      >+</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
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
                  <span className="seats-list">{selectedSeats.map(s => s.displayKey).join(', ')}</span>
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
    const fullSynopsis = selectedFilm.Synopsis || selectedFilm.ShortSynopsis || ''
    const hasDetails = selectedFilm.Director || selectedFilm.Cast || fullSynopsis

    return (
      <FilmHero
        film={selectedFilm}
        onBack={() => setStep('films')}
        backLabel={t('film.backToMovies')}
      >
        <h2 className="sessions-title">{t('sessions.title')}</h2>
        <hr className="section-divider" />

        {allSessionsByDate.length === 0 && (
          <p className="empty-state">{t('sessions.empty')}</p>
        )}

        {allSessionsByDate.map(({ day, sessions }) => (
          <div key={day} className="session-day-group">
            <h3 className="session-day-label">{formatDateHeader(day)}</h3>
            <div className="film-sessions">
              {sessions.map(s => (
                <button
                  key={s.Id}
                  className="session-time-btn"
                  onClick={() => selectSession(s)}
                >
                  {formatHour(sessionTime(s))}
                </button>
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

            {fullSynopsis && (
              <p className="film-details-synopsis">{fullSynopsis}</p>
            )}
          </div>
        )}
      </FilmHero>
    )
  }

  // ── Étape 4 — Paiement ───────────────────────────────────────────────────────
  if (step === 'payment' && selectedFilm) {
    // Détail des billets choisis (issu de la grille tarifaire live), s'il existe
    const ticketBreakdown = (sessionTickets || [])
      .map(t => ({
        code: t.TicketTypeCode,
        description: t.Description,
        priceInCents: t.PriceInCents,
        qty: ticketCounts[t.TicketTypeCode] || 0,
      }))
      .filter(t => t.qty > 0)
    const breakdownTotalCents = ticketBreakdown.length
      ? ticketBreakdown.reduce((s, t) => s + t.qty * t.priceInCents, 0)
      : null

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
          setStep('done')
        }}
        onBack={() => setStep('seats')}
      />
    )
  }

  return (
    <>
      {step === 'films' && (
        <HeroSlider films={heroFilms} loading={loading} onSelectFilm={selectFilm} />
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

          {/* Sélecteur de dates — masqué en mode PAR FILM */}
          {groupBy === 'jour' && availableDays.length > 0 && (
            <DatePicker
              days={availableDays}
              selected={selectedDay}
              onSelect={setSelectedDay}
            />
          )}

          {/* Liste de films */}
          {loading && <FilmsListSkeleton />}

          {!loading && (
            <div className="films-list">
              {visibleFilms.length === 0 && (
                <p className="empty-state">{t('home.emptyDay')}</p>
              )}

              {visibleFilms.map((film, idx) => {
                const filmSessions = sessionsByDay.filter(s => String(s.FilmId) === String(film.Id))
                const synopsis = film.Synopsis || film.ShortSynopsis || ''
                const isExpanded = expandedFilms.has(film.Id)
                const needsTruncation = synopsis.length > 180
                const displayedSynopsis = isExpanded || !needsTruncation ? synopsis : synopsis.slice(0, 180) + '...'

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
                  <div key={film.Id}>
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
                          {film.Rating && <span>{film.Rating}</span>}
                          {film.Rating && film.Duration && <span> | </span>}
                          {film.Duration && <span>{film.Duration} {t('home.mins')}</span>}
                        </p>

                        {synopsis && (
                          <p className="film-synopsis">
                            {displayedSynopsis}
                            {needsTruncation && (
                              <> <button className="synopsis-more" onClick={toggleExpand}>
                                {isExpanded ? t('home.less') : t('home.more')}
                              </button></>
                            )}
                          </p>
                        )}

                        {/* Boutons de séances */}
                        <div className="film-sessions">
                          {filmSessions.map(s => (
                            <button
                              key={s.Id}
                              className="session-time-btn"
                              onClick={() => selectSession(s)}
                            >
                              {formatHour(sessionTime(s))}
                            </button>
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
              onSelect={setSelectedDay}
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
                  {selectedFilm.Duration && `${selectedFilm.Duration} ${t('home.mins')}`}
                  {selectedFilm.Duration && selectedFilm.Rating && ' · '}
                  {selectedFilm.Rating}
                </p>
              </div>
            </div>
          )}

          {sessionsForFilm.length === 0
            ? <p className="empty-state">{t('sessions.emptyDay')}</p>
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
          screenName={selectedSession?.ScreenName || t('film.screenFallback', { id: selectedSession?.ScreenId })}
          seats={selectedSeats}
          totalCents={bookingResult?.total_amount_cents ?? (ticketUnitPrice != null ? ticketUnitPrice * selectedSeats.length : null)}
          onReset={reset}
        />
      )}

    </div>
    </>
  )
}
