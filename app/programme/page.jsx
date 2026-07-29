'use client'

import { useState, useEffect } from 'react'
import { useI18n } from '@/lib/i18n'
import { fixImageUrl } from '@/lib/images'

// ─── Programme de la semaine ──────────────────────────────────────────────────
// cinepax.mg publie une affiche JPEG redéposée chaque semaine dans son CMS —
// introuvable via l'API, et périmée dès la semaine suivante. On reconstruit
// donc le programme depuis Veezi (/api/programme) : il reste juste tout seul.

const TZ = 'Etc/GMT-3'

function formatDay(dateKey, locale) {
  const d = new Date(dateKey + 'T12:00:00Z')
  return {
    weekday: d.toLocaleDateString(locale, { timeZone: TZ, weekday: 'long' }),
    date: d.toLocaleDateString(locale, { timeZone: TZ, day: 'numeric', month: 'long' }),
  }
}

function formatHour(iso, locale) {
  return new Date(iso).toLocaleTimeString(locale, {
    timeZone: TZ, hour: '2-digit', minute: '2-digit',
  })
}

function ProgrammeSkeleton() {
  return (
    <div aria-hidden="true">
      {[0, 1].map(d => (
        <div key={d} className="prog-day">
          <div className="prog-day-head">
            <div className="sk-shine" style={{ width: 140, height: 18, borderRadius: 6 }} />
          </div>
          {[0, 1, 2].map(i => (
            <div key={i} className="prog-row">
              <div className="prog-poster sk-shine" />
              <div style={{ flex: 1 }}>
                <div className="sk-shine" style={{ width: '42%', height: 14, borderRadius: 6 }} />
                <div className="prog-times" style={{ marginTop: 12 }}>
                  {[0, 1, 2].map(j => (
                    <div key={j} className="sk-shine" style={{ width: 62, height: 30, borderRadius: 6 }} />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export default function ProgrammePage() {
  const { t, locale } = useI18n()

  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    fetch('/api/programme')
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error)
        setData(d)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const days = data?.days || []

  return (
    <div className="page-container">
      <div className="section-header">
        <h1 className="section-title">{t('programme.title')}</h1>
        {data && (
          <p className="prog-meta">
            {t('programme.summary', { sessions: data.totalSessions, days: days.length })}
          </p>
        )}
      </div>
      <hr className="section-divider" />

      {error && <div className="error-banner">⚠ {error}</div>}

      {loading && <ProgrammeSkeleton />}

      {!loading && !error && days.length === 0 && (
        <p className="empty-state">{t('programme.empty')}</p>
      )}

      {/* La semaine complète fait plusieurs écrans de haut : ces raccourcis
          évitent de la faire défiler pour atteindre un jour précis. */}
      {days.length > 1 && (
        <nav className="prog-jump" aria-label={t('programme.jumpLabel')}>
          {days.map(day => {
            const { weekday, date } = formatDay(day.date, locale)
            return (
              <a key={day.date} href={`#jour-${day.date}`} className="prog-jump-item">
                <span className="prog-jump-day">{weekday}</span>
                <span className="prog-jump-date">{date}</span>
              </a>
            )
          })}
        </nav>
      )}

      {days.map(day => {
        const { weekday, date } = formatDay(day.date, locale)
        return (
          <section key={day.date} id={`jour-${day.date}`} className="prog-day">
            <header className="prog-day-head">
              <h2 className="prog-day-name">{weekday}</h2>
              <span className="prog-day-date">{date}</span>
              <span className="prog-day-count">
                {t('programme.filmCount', { n: day.films.length, count: day.films.length })}
              </span>
            </header>

            {day.films.map(film => (
              <article key={film.filmId} className="prog-row">
                {film.poster
                  ? <img className="prog-poster" src={fixImageUrl(film.poster)} alt="" loading="lazy" />
                  : <div className="prog-poster prog-poster--empty">{film.title.charAt(0)}</div>
                }

                <div className="prog-info">
                  <h3 className="prog-film-title">{film.title}</h3>
                  <p className="prog-film-meta">
                    {[film.rating, film.duration && `${film.duration} ${t('home.mins')}`, film.genre]
                      .filter(Boolean).join(' · ')}
                  </p>

                  <div className="prog-times">
                    {film.sessions.map(s => (
                      <span
                        key={s.id}
                        className={`prog-time ${s.soldOut ? 'is-soldout' : ''}`}
                        title={[s.format, s.priceCard].filter(Boolean).join(' · ')}
                      >
                        <span className="prog-time-hour">{formatHour(s.start, locale)}</span>
                        {s.format && <span className="prog-time-format">{s.format}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </section>
        )
      })}
    </div>
  )
}
