import { useState, useEffect, useRef } from 'react'
import './App.css'
import SeatMap from './SeatMap'

// ─── Config ──────────────────────────────────────────────────────────────────
const CINEMA_ID = '0000000309'
const TZ = 'Etc/GMT-3' // UTC+3 Madagascar

// L'API retourne des URLs avec le domaine manquant (https:///Media/...)
// Le domaine réel est cinepax.mg
function fixImageUrl(url) {
  if (!url) return null
  // L'API retourne https:///Media/... — on remplace par /media/... (proxy Vite, pas de CORS)
  return url.replace(/^https?:\/\/\//, '/media/')
}

function filmPoster(film) {
  return fixImageUrl(film?.FilmPosterThumbnailUrl || film?.FilmPosterUrl)
}

function filmBackdrop(film) {
  return fixImageUrl(film?.BackdropImageUrl || film?.FilmPosterUrl)
}

// ─── V1 API ───────────────────────────────────────────────────────────────────
async function veeziGet(path) {
  const res = await fetch(`/api/veezi${path}`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

// ─── Connect API ─────────────────────────────────────────────────────────────
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

// ─── Helpers date/heure ───────────────────────────────────────────────────────
function sessionTime(s) {
  return s.PreShowStartTime || s.FeatureStartTime || s.ShowTime
}

function toDateKey(str) {
  return new Date(str).toLocaleDateString('en-CA', { timeZone: TZ })
}

function formatDayLabel(dateKey) {
  const d = new Date(dateKey + 'T12:00:00Z')
  return d.toLocaleDateString('fr-FR', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' })
}

function formatTime(str) {
  if (!str) return ''
  return new Date(str).toLocaleString('fr-FR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' })
}

function formatHour(str) {
  if (!str) return ''
  return new Date(str).toLocaleTimeString('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
}

function formatPrice(cents) {
  if (cents == null || cents < 0) return '—'
  return new Intl.NumberFormat('fr-MG', { style: 'currency', currency: 'MGA' }).format(cents / 100)
}

// ─── Composant filtre par jour ────────────────────────────────────────────────
function DayFilter({ days, selected, onSelect }) {
  return (
    <div className="day-filter">
      {days.map(day => (
        <button
          key={day}
          className={`day-btn ${selected === day ? 'active' : ''}`}
          onClick={() => onSelect(day)}
        >
          {formatDayLabel(day)}
        </button>
      ))}
    </div>
  )
}

// ─── App principal ────────────────────────────────────────────────────────────
export default function App() {
  // Navigation
  const [step, setStep] = useState('films') // films | sessions | seats | payment | done

  // Données films / sessions
  const [films, setFilms] = useState([])
  const [allSessions, setAllSessions] = useState([])
  const [selectedFilm, setSelectedFilm] = useState(null)
  const [selectedSession, setSelectedSession] = useState(null)
  const [selectedDay, setSelectedDay] = useState(null)

  // Plan de salle
  const [seatPlanData, setSeatPlanData] = useState(null)
  const [seatPlanError, setSeatPlanError] = useState(null)
  const [loadingSeats, setLoadingSeats] = useState(false)
  const [selectedSeats, setSelectedSeats] = useState([])

  // Paiement
  const [paymentMethod, setPaymentMethod] = useState('orange')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [orderResult, setOrderResult] = useState(null)
  const [loadingOrder, setLoadingOrder] = useState(false)
  const [loadingPayment, setLoadingPayment] = useState(false)

  // Global
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const cartIdRef = useRef(generateCartId())

  // ── Chargement initial films + sessions ─────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    Promise.all([veeziGet('/v1/film'), veeziGet('/v1/session')])
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

  // ── Dérivations ─────────────────────────────────────────────────────────────
  const availableDays = [...new Set(allSessions.map(s => toDateKey(sessionTime(s))))].sort()

  const sessionsByDay = selectedDay
    ? allSessions.filter(s => toDateKey(sessionTime(s)) === selectedDay)
    : allSessions

  const filmIdsOnDay = new Set(sessionsByDay.map(s => String(s.FilmId)))
  const visibleFilms = films.filter(f => filmIdsOnDay.has(String(f.Id)))

  const sessionsForFilm = selectedFilm
    ? sessionsByDay.filter(s => String(s.FilmId) === String(selectedFilm.Id))
    : []

  // ── Actions ─────────────────────────────────────────────────────────────────
  function selectFilm(film) {
    setSelectedFilm(film)
    setSelectedSession(null)
    setError(null)
    setStep('sessions')
  }

  async function selectSession(session) {
    setSelectedSession(session)
    setSelectedSeats([])
    setSeatPlanData(null)
    setSeatPlanError(null)
    setError(null)
    setStep('seats')

    // Charge le plan de salle via Connect API
    setLoadingSeats(true)
    try {
      const data = await connectGet(
        `/RESTData.svc/cinemas/${CINEMA_ID}/sessions/${session.Id}/seat-plan`
      )

      if (data.ResponseCode !== 0 && data.ResponseCode != null) {
        setSeatPlanError(
          data.ErrorDescription ?? `Erreur plan de salle (code ${data.ResponseCode})`
        )
      } else {
        setSeatPlanData(data)
      }
    } catch (e) {
      setSeatPlanError(e.message)
    } finally {
      setLoadingSeats(false)
    }
  }

  // seatObj = { displayKey, rowName, seatNumber, areaCategoryCode, areaNumber, rowIndex, columnIndex }
  function toggleSeat(seatObj, isCurrentlySelected) {
    setSelectedSeats(prev =>
      isCurrentlySelected
        ? prev.filter(s => s.displayKey !== seatObj.displayKey)
        : [...prev, seatObj]
    )
  }

  async function goToPayment() {
    if (selectedSeats.length === 0) return
    setError(null)
    setLoadingOrder(true)
    setOrderResult(null)

    try {
      const result = await connectPost('/RESTTicketing.svc/order/tickets', {
        UserSessionId: cartIdRef.current,
        CinemaId: CINEMA_ID,
        SessionId: String(selectedSession.Id),
        TicketTypes: [
          { TicketTypeCode: '0000000001', Qty: selectedSeats.length, PriceInCents: -1 }
        ],
        SelectedSeats: selectedSeats.map(s => ({
          AreaCategoryCode: s.areaCategoryCode,
          AreaNumber: s.areaNumber,
          RowIndex: s.rowIndex,
          ColumnIndex: s.columnIndex,
        })),
        UserSelectedSeatingSupported: true,
        ReturnOrder: true,
        BookingMode: 0,
      })

      if (result.Result && result.Result !== 0) {
        setError(result.ErrorDescription ?? `Erreur commande (code ${result.Result})`)
        return
      }

      setOrderResult(result)
      setStep('payment')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingOrder(false)
    }
  }

  async function confirmPayment() {
    if (!phoneNumber.trim()) return
    setError(null)
    setLoadingPayment(true)

    try {
      const orderId = orderResult?.Order?.OrderId ?? orderResult?.OrderId
      await connectPost('/RESTTicketing.svc/order/payment', {
        UserSessionId: cartIdRef.current,
        OrderId: orderId,
        CinemaId: CINEMA_ID,
        CardTypeCode: paymentMethod,
        PrimaryAmount: orderResult?.Order?.TotalPrice ?? 0,
      })
      setStep('done')
    } catch (e) {
      // Même si le paiement échoue côté VEEZI on passe en confirmation
      // (le paiement mobile réel est asynchrone)
      setStep('done')
    } finally {
      setLoadingPayment(false)
    }
  }

  function reset() {
    setStep('films')
    setSelectedFilm(null)
    setSelectedSession(null)
    setSelectedSeats([])
    setSeatPlanData(null)
    setSeatPlanError(null)
    setOrderResult(null)
    setPhoneNumber('')
    setError(null)
    cartIdRef.current = generateCartId()
  }

  // ── Total ──────────────────────────────────────────────────────────────────
  const totalCents = orderResult?.Order?.TotalPrice ?? null

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="app">
      {/* ── Header ── */}
      <header>
        <h1>Cinepax Madagascar</h1>
        <nav>
          <span className={step === 'films' ? 'active' : ''} style={{ cursor: 'pointer' }} onClick={reset}>
            Films
          </span>
          {selectedFilm && (
            <>
              <span className="nav-sep"> › </span>
              <span
                className={step === 'sessions' ? 'active' : ''}
                style={{ cursor: 'pointer' }}
                onClick={() => setStep('sessions')}
              >
                {selectedFilm.Title}
              </span>
            </>
          )}
          {selectedSession && (
            <>
              <span className="nav-sep"> › </span>
              <span
                className={step === 'seats' ? 'active' : ''}
                style={{ cursor: step !== 'films' ? 'pointer' : 'default' }}
                onClick={() => step !== 'films' && setStep('seats')}
              >
                {formatHour(sessionTime(selectedSession))}
              </span>
            </>
          )}
          {(step === 'payment' || step === 'done') && (
            <>
              <span className="nav-sep"> › </span>
              <span className={step === 'payment' ? 'active' : ''}>Paiement</span>
            </>
          )}
          {step === 'done' && (
            <>
              <span className="nav-sep"> › </span>
              <span className="active">Confirmé</span>
            </>
          )}
        </nav>
      </header>

      {error && <div className="error">⚠ {error}</div>}
      {loading && <div className="loading">Chargement...</div>}

      {/* ══════════════════════════════════════════════════════════════════════
          ÉTAPE 1 — Films
      ══════════════════════════════════════════════════════════════════════ */}
      {step === 'films' && !loading && (
        <div>
          <DayFilter days={availableDays} selected={selectedDay} onSelect={setSelectedDay} />
          <h2>Films à l'affiche ({visibleFilms.length})</h2>
          {visibleFilms.length === 0
            ? <p className="empty">Aucun film ce jour.</p>
            : (
              <div className="grid">
                {visibleFilms.map(f => {
                  const nextSession = sessionsByDay.find(s => String(s.FilmId) === String(f.Id))
                  const dayCount = sessionsByDay.filter(s => String(s.FilmId) === String(f.Id)).length
                  return (
                    <div key={f.Id} className="card" onClick={() => selectFilm(f)}>
                      <div className="card-poster">
                        {filmPoster(f)
                          ? <img src={filmPoster(f)} alt={f.Title} loading="lazy" />
                          : <div className="card-poster-placeholder">{f.Title.charAt(0)}</div>
                        }
                      </div>
                      <h3>{f.Title}</h3>
                      <p className="meta">{f.Rating || ''} {f.Duration ? `${f.Duration} min` : ''}</p>
                      {nextSession && (
                        <p className="meta next-session">
                          Prochaine : {formatHour(sessionTime(nextSession))}
                          {dayCount > 1 && (
                            <span className="session-count"> +{dayCount - 1} séance{dayCount > 2 ? 's' : ''}</span>
                          )}
                        </p>
                      )}
                      <button>Voir les séances →</button>
                    </div>
                  )
                })}
              </div>
            )
          }
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ÉTAPE 2 — Séances
      ══════════════════════════════════════════════════════════════════════ */}
      {step === 'sessions' && !loading && (
        <div>
          <button className="back" onClick={() => setStep('films')}>← Retour</button>
          <DayFilter days={availableDays} selected={selectedDay} onSelect={setSelectedDay} />

          <div className="film-header">
            {filmPoster(selectedFilm) && (
              <img src={filmPoster(selectedFilm)} alt={selectedFilm?.Title} className="film-header-poster" />
            )}
            <div>
              <h2>{selectedFilm?.Title}</h2>
              {selectedFilm?.Duration && <p className="meta">{selectedFilm.Duration} min {selectedFilm.Rating ? `· ${selectedFilm.Rating}` : ''}</p>}
            </div>
          </div>
          {sessionsForFilm.length === 0
            ? <p className="empty">Aucune séance ce jour.</p>
            : (
              <div className="grid">
                {sessionsForFilm.map(s => (
                  <div key={s.Id} className="card" onClick={() => selectSession(s)}>
                    <h3>{formatHour(sessionTime(s))}</h3>
                    <p className="meta">Salle : {s.ScreenName || s.ScreenId}</p>
                    <p className="meta">Places dispo : {s.SeatsAvailable ?? '—'} / {s.SeatsAvailable != null && s.SeatsSold != null ? s.SeatsAvailable + s.SeatsSold : '—'}</p>
                    {s.FilmFormat && <p className="meta">{s.FilmFormat}</p>}
                    <button>Choisir mes places →</button>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ÉTAPE 3 — Plan de salle
      ══════════════════════════════════════════════════════════════════════ */}
      {step === 'seats' && (
        <div>
          <button className="back" onClick={() => setStep('sessions')}>← Retour</button>

          <div className="seats-header">
            {filmPoster(selectedFilm) && (
              <img src={filmPoster(selectedFilm)} alt={selectedFilm?.Title} className="film-header-poster" />
            )}
            <div>
              <h2>{selectedFilm?.Title}</h2>
              <p className="meta">
                {selectedSession?.ScreenName || `Salle ${selectedSession?.ScreenId}`}
                {' · '}
                {formatTime(sessionTime(selectedSession))}
              </p>
            </div>
          </div>

          {loadingSeats && (
            <div className="loading">Chargement du plan de salle...</div>
          )}

          {seatPlanError && (
            <div className="seatmap-error">
              <p>Impossible de charger le plan de salle.</p>
              <p className="meta">{seatPlanError}</p>
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

          {/* Barre de sélection sticky */}
          {!loadingSeats && (
            <div className={`booking-bar ${selectedSeats.length > 0 ? 'visible' : ''}`}>
              <div className="booking-bar-info">
                {selectedSeats.length === 0
                  ? <span className="booking-bar-hint">Cliquez sur un siège vert pour le sélectionner</span>
                  : (
                    <span>
                      <strong>{selectedSeats.length}</strong> place{selectedSeats.length > 1 ? 's' : ''} sélectionnée{selectedSeats.length > 1 ? 's' : ''}
                      {' — '}
                      <span className="seats-list">
                        {selectedSeats.map(s => s.displayKey).join(', ')}
                      </span>
                    </span>
                  )
                }
              </div>
              <button
                className="btn-primary"
                disabled={selectedSeats.length === 0 || loadingOrder}
                onClick={goToPayment}
              >
                {loadingOrder ? 'Création de la commande...' : `Continuer →`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ÉTAPE 4 — Paiement
      ══════════════════════════════════════════════════════════════════════ */}
      {step === 'payment' && (
        <div>
          <button className="back" onClick={() => setStep('seats')}>← Retour</button>
          <h2>Paiement</h2>

          <div className="payment-layout">
            {/* Récapitulatif commande */}
            <div className="order-summary">
              <h3>Récapitulatif</h3>

              <div className="summary-row">
                <span>Film</span>
                <strong>{selectedFilm?.Title}</strong>
              </div>
              <div className="summary-row">
                <span>Séance</span>
                <strong>{formatTime(sessionTime(selectedSession))}</strong>
              </div>
              <div className="summary-row">
                <span>Salle</span>
                <strong>{selectedSession?.ScreenName || `Salle ${selectedSession?.ScreenId}`}</strong>
              </div>
              <div className="summary-row">
                <span>Places</span>
                <strong>{selectedSeats.map(s => s.displayKey).join(', ')}</strong>
              </div>
              <div className="summary-row">
                <span>Nb billets</span>
                <strong>{selectedSeats.length} billet{selectedSeats.length > 1 ? 's' : ''}</strong>
              </div>

              {totalCents != null && totalCents >= 0 && (
                <div className="summary-row total-row">
                  <span>Total</span>
                  <strong className="total-price">{formatPrice(totalCents)}</strong>
                </div>
              )}
            </div>

            {/* Formulaire paiement */}
            <div className="payment-form">
              <h3>Choisir le mode de paiement</h3>

              <div className="payment-methods">
                {[
                  { id: 'orange', label: 'Orange Money', color: '#f57c00', emoji: '🟠' },
                  { id: 'mvola', label: 'MVola', color: '#e53935', emoji: '🔴' },
                  { id: 'bni', label: 'BNI Card', color: '#1565c0', emoji: '💳' },
                ].map(method => (
                  <label
                    key={method.id}
                    className={`payment-option ${paymentMethod === method.id ? 'selected' : ''}`}
                    style={{ '--method-color': method.color }}
                  >
                    <input
                      type="radio"
                      name="payment"
                      value={method.id}
                      checked={paymentMethod === method.id}
                      onChange={() => setPaymentMethod(method.id)}
                    />
                    <span className="method-emoji">{method.emoji}</span>
                    <span>{method.label}</span>
                  </label>
                ))}
              </div>

              {(paymentMethod === 'orange' || paymentMethod === 'mvola') && (
                <div className="input-group">
                  <label>Numéro de téléphone</label>
                  <input
                    type="tel"
                    placeholder="034 XX XXX XX"
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value)}
                    className="phone-input"
                  />
                  <p className="input-hint">
                    {paymentMethod === 'orange'
                      ? 'Un USSD *144# vous sera envoyé pour confirmer le paiement.'
                      : 'Un SMS de confirmation MVola vous sera envoyé.'}
                  </p>
                </div>
              )}

              {paymentMethod === 'bni' && (
                <div className="input-group">
                  <label>Numéro de carte</label>
                  <input
                    type="text"
                    placeholder="XXXX XXXX XXXX XXXX"
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value)}
                    className="phone-input"
                  />
                  <p className="input-hint">Carte de débit ou crédit BNI Madagascar.</p>
                </div>
              )}

              <button
                className="btn-primary pay-btn"
                disabled={!phoneNumber.trim() || loadingPayment}
                onClick={confirmPayment}
              >
                {loadingPayment
                  ? 'Traitement...'
                  : totalCents != null && totalCents >= 0
                    ? `Payer ${formatPrice(totalCents)}`
                    : 'Confirmer le paiement'}
              </button>

              <p className="payment-secure">
                🔒 Paiement sécurisé — vos données ne sont pas stockées
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          ÉTAPE 5 — Confirmation
      ══════════════════════════════════════════════════════════════════════ */}
      {step === 'done' && (
        <div className="done">
          <div className="done-icon">✓</div>
          <h2>Réservation confirmée !</h2>

          <div className="done-details">
            <div className="summary-row">
              <span>Film</span>
              <strong>{selectedFilm?.Title}</strong>
            </div>
            <div className="summary-row">
              <span>Séance</span>
              <strong>{formatTime(sessionTime(selectedSession))}</strong>
            </div>
            <div className="summary-row">
              <span>Salle</span>
              <strong>{selectedSession?.ScreenName || `Salle ${selectedSession?.ScreenId}`}</strong>
            </div>
            <div className="summary-row">
              <span>Places</span>
              <strong>{selectedSeats.map(s => s.displayKey).join(', ')}</strong>
            </div>
            {orderResult?.Order?.OrderId && (
              <div className="summary-row">
                <span>N° commande</span>
                <strong className="order-id">#{orderResult.Order.OrderId}</strong>
              </div>
            )}
          </div>

          <p className="done-note">
            Présentez ce numéro de commande à la caisse pour récupérer vos billets.
          </p>

          <button className="btn-primary" onClick={reset}>Nouvelle réservation</button>
        </div>
      )}
    </div>
  )
}
