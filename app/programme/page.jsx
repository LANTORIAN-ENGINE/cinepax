'use client'

import { useState, useEffect } from 'react'
import { useI18n, formatDuration } from '@/lib/i18n'
import { fixImageUrl } from '@/lib/images'
import { IconDownload } from '@/components/icons'
import { ratingLabel } from '@/lib/classification'
import { isSaleOpen, DEFAULTS as VENTE_DEFAUTS } from '@/lib/ventes'

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
  const { t, lang, locale } = useI18n()

  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [vente, setVente]     = useState(VENTE_DEFAUTS)
  const [now, setNow]         = useState(() => Date.now())

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

  // Délai de fermeture de la vente en ligne. Cette page est un horaire, pas
  // une caisse : par défaut les séances refermées y restent lisibles, barrées
  // d'une mention « à la caisse ». L'administration peut les faire disparaître
  // tout à fait (hideInProgramme) si le cinéma préfère ne montrer que ce qui
  // s'achète depuis le site.
  useEffect(() => {
    fetch('/api/ventes')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setVente(d) })
      .catch(() => {})
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const sessionOpen = s => isSaleOpen(s.start, vente.cutoffMinutes, now)

  // Une séance refermée est marquée, ou retirée. Un film dont il ne reste
  // rien, un jour dont il ne reste aucun film : les deux s'effacent avec
  // elles, sinon la page se remplirait de titres sans horaires.
  const days = (data?.days || [])
    .map(day => ({
      ...day,
      films: day.films
        .map(film => ({
          ...film,
          sessions: vente.hideInProgramme
            ? film.sessions.filter(sessionOpen)
            : film.sessions.map(s => ({ ...s, saleClosed: !sessionOpen(s) })),
        }))
        .filter(film => film.sessions.length > 0),
    }))
    .filter(day => day.films.length > 0)

  // Y a-t-il, à l'écran, au moins une séance refermée ? La légende n'apparaît
  // que si elle a quelque chose à expliquer — et seulement si un délai est
  // réglé : sans délai, une séance grisée est une séance qui a commencé
  // pendant que la page était en cache, ce que la légende n'explique pas.
  const hasClosed = !vente.hideInProgramme
    && vente.cutoffMinutes > 0
    && days.some(d => d.films.some(f => f.sessions.some(s => s.saleClosed)))

  return (
    <div className="page-container">
      <div className="section-header">
        <h1 className="section-title">{t('programme.title')}</h1>
        {data && (
          <p className="prog-meta">
            {/* Compté sur ce qui est affiché, pas sur ce que l'API a renvoyé :
                masquer des séances sans corriger le total ferait mentir la
                phrase d'un chiffre que personne ne peut retrouver. */}
            {t('programme.summary', {
              sessions: days.reduce((n, d) => n + d.films.reduce((m, f) => m + f.sessions.length, 0), 0),
              days: days.length,
            })}
          </p>
        )}
      </div>
      <hr className="section-divider" />

      {error && <div className="error-banner">⚠ {error}</div>}

      {loading && <ProgrammeSkeleton />}

      {!loading && !error && days.length === 0 && (
        <p className="empty-state">{t('programme.empty')}</p>
      )}

      {/* ── Affiche de la semaine ────────────────────────────────────
          Même objet que l'affiche publiée chaque semaine par cinepax.mg, à
          ceci près qu'elle se compose depuis Veezi et se régénère seule : la
          leur, déposée à la main dans leur CMS, se périme le lundi suivant.
          Elle se télécharge — c'est l'usage réel de ce format, qui circule
          sur Facebook et WhatsApp. */}
      {!loading && !error && days.length > 0 && (
        <section className="prog-poster-section">
          <div className="prog-poster-head">
            <h2 className="prog-poster-title">{t('programme.posterTitle')}</h2>
            <a
              className="prog-poster-dl"
              href="/api/programme/affiche"
              download="cinepax-programme.png"
            >
              <IconDownload size={16} />
              {t('programme.posterDownload')}
            </a>
          </div>
          <a href="/api/programme/affiche" target="_blank" rel="noreferrer" className="prog-poster-frame">
            <img src="/api/programme/affiche" alt={t('programme.posterAlt')} loading="lazy" />
          </a>
          <p className="prog-poster-note">{t('programme.posterNote')}</p>
        </section>
      )}

      {/* La semaine complète fait plusieurs écrans de haut : ces raccourcis
          évitent de la faire défiler pour atteindre un jour précis. */}
      {!loading && days.length > 0 && (
        <h2 className="prog-detail-title">{t('programme.detailTitle')}</h2>
      )}

      {/* Ce qui se lit sans s'acheter en ligne : une pastille grisée dans la
          grille, et ici la phrase qui l'explique une seule fois. */}
      {!loading && hasClosed && (
        <p className="prog-legend">
          <span className="prog-time prog-time--sample is-closed" aria-hidden="true">
            <span className="prog-time-hour">00:00</span>
          </span>
          {t('ventes.programmeLegend', { delay: formatDuration(vente.cutoffMinutes, lang) })}
        </p>
      )}

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
                    {[ratingLabel(film.rating, t), film.duration && formatDuration(film.duration, lang), film.genre]
                      .filter(Boolean).join(' · ')}
                  </p>

                  <div className="prog-times">
                    {film.sessions.map(s => (
                      <span
                        key={s.id}
                        className={`prog-time ${s.soldOut ? 'is-soldout' : ''} ${s.saleClosed ? 'is-closed' : ''}`}
                        title={[
                          s.format,
                          s.priceCard,
                          s.saleClosed ? t('ventes.closedDesk') : null,
                        ].filter(Boolean).join(' · ')}
                      >
                        <span className="prog-time-hour">{formatHour(s.start, locale)}</span>
                        {s.format && <span className="prog-time-format">{s.format}</span>}
                        {s.saleClosed && (
                          <span className="prog-time-closed">{t('ventes.deskShort')}</span>
                        )}
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
