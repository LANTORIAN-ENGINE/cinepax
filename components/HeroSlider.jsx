'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useI18n, formatDuration } from '@/lib/i18n'
import { parseSynopsis, flattenSynopsis, renderSynopsis } from '@/lib/synopsis'
import { ratingLabel, genreLabel } from '@/lib/classification'
import { bandeAnnonce, titreOeuvre, vignetteYoutube, INDEX_VIDE } from '@/lib/bandesAnnonces'
import { TrailerModal } from '@/components/BandeAnnonce'

// ─── Carrousel d'accueil ──────────────────────────────────────────────────────
// Reproduit le slider vidéo plein cadre de cinepax.mg. La couverture vient
// toujours de Veezi (BackdropImageUrl, visuel 1920×1080 du CDN) ; la vidéo,
// elle, a deux origines possibles :
//   • le fichier déposé par le cinéma dans /admin/bandes-annonces ;
//   • à défaut, le lien YouTube saisi par le distributeur (FilmTrailerUrl).
// C'est lib/bandesAnnonces.js qui tranche, une fois pour tout le site. Aucun
// appel réseau supplémentaire ici : la liste de films et l'index des bandes
// annonces sont ceux déjà chargés par la page d'accueil.

const MAX_SLIDES     = 6      // au-delà, le carrousel devient un catalogue
const IMAGE_SLIDE_MS = 7000   // durée d'une slide sans bande annonce
const VIDEO_SLIDE_MS = 30000  // extrait de bande annonce avant passage à la suivante

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Sélectionne les films mis en avant : un seul par œuvre, visuel obligatoire.
// `trailers` est l'index de lib/bandesAnnonces — sans lui, la résolution
// retombe sur le lien Veezi de chaque fiche, ce qui est le comportement d'avant.
export function pickHeroFilms(films, trailers = INDEX_VIDE) {
  const seen = new Set()
  const picked = []
  for (const film of films || []) {
    const trailer = bandeAnnonce(film, trailers)
    if (!film.BackdropImageUrl && !trailer) continue
    // Deux fiches (VF, VO) qui partagent la même vidéo ne font qu'une slide ;
    // à défaut de vidéo, c'est le titre de l'œuvre qui les regroupe.
    const key = trailer?.src || trailer?.videoId || titreOeuvre(film.Title)
    if (seen.has(key)) continue
    seen.add(key)
    picked.push({ film, trailer })
    if (picked.length >= MAX_SLIDES) break
  }
  return picked
}

// Visuel de couverture. À défaut de backdrop Veezi, la miniature YouTube fait
// l'affaire — recadrée, car maxresdefault comporte des bandes noires. Un
// fichier déposé n'a pas de miniature : on retombe alors sur l'affiche.
function coverImage(film, trailer) {
  if (film.BackdropImageUrl) return { src: film.BackdropImageUrl, fromYoutube: false }
  if (trailer?.kind === 'youtube') return { src: vignetteYoutube(trailer.videoId), fromYoutube: true }
  return { src: film.FilmPosterUrl, fromYoutube: false }
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return reduced
}

// Charge l'API IFrame YouTube une seule fois pour toute l'application.
function useYouTubeApi(enabled) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!enabled) return
    let alive = true
    if (window.YT?.Player) { setReady(true); return }
    if (!window.__cinepaxYtApi) {
      window.__cinepaxYtApi = new Promise(resolve => {
        const previous = window.onYouTubeIframeAPIReady
        window.onYouTubeIframeAPIReady = () => { previous?.(); resolve() }
        const script = document.createElement('script')
        script.src = 'https://www.youtube.com/iframe_api'
        document.head.appendChild(script)
      })
    }
    window.__cinepaxYtApi.then(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [enabled])
  return ready
}

// ─── Lecteur de bande annonce ─────────────────────────────────────────────────
// Monté uniquement sur la slide active : un seul lecteur vit à la fois.
//
// Les deux lecteurs présentent la même surface — jouer, couper le son, dire où
// on en est, dire qu'on a fini — pour que le carrousel n'ait pas à savoir ce
// qu'il diffuse.
function TrailerPlayer({ trailer, playing, muted, onStarted, onTick, onEnded }) {
  if (trailer.kind === 'fichier') {
    return (
      <FileTrailer
        src={trailer.src}
        playing={playing}
        muted={muted}
        onStarted={onStarted}
        onTick={onTick}
        onEnded={onEnded}
      />
    )
  }
  return (
    <YoutubeTrailer
      videoId={trailer.videoId}
      playing={playing}
      muted={muted}
      onStarted={onStarted}
      onTick={onTick}
      onEnded={onEnded}
    />
  )
}

// ─── Fichier déposé par le cinéma ─────────────────────────────────────────────
// En sourdine et sans commandes : le carrousel les porte déjà. `muted` est posé
// en attribut *et* en propriété — un navigateur qui ne voit pas l'attribut au
// premier rendu refuse le démarrage automatique et la slide resterait figée sur
// sa couverture.
//
// Un fichier illisible (codec que le navigateur ne connaît pas, objet effacé du
// bucket) ne bloque pas le carrousel : onError enchaîne, exactement comme une
// vidéo YouTube retirée.
function FileTrailer({ src, playing, muted, onStarted, onTick, onEnded }) {
  const ref = useRef(null)

  const cbRef = useRef({ onStarted, onTick, onEnded })
  cbRef.current = { onStarted, onTick, onEnded }

  // La progression est relevée à chaque image, et non sur timeupdate, qui ne
  // bat que quatre fois par seconde : la barre avancerait par à-coups.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const el = ref.current
      if (el && !el.paused) cbRef.current.onTick?.(el.currentTime)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (playing) el.play().catch(() => {})
    else el.pause()
  }, [playing, src])

  useEffect(() => {
    const el = ref.current
    if (el) el.muted = muted
  }, [muted])

  return (
    <div className="hero-video hero-video--file" aria-hidden="true">
      <video
        ref={ref}
        src={src}
        muted={muted}
        autoPlay
        playsInline
        preload="auto"
        tabIndex={-1}
        onPlaying={() => cbRef.current.onStarted?.()}
        onEnded={() => cbRef.current.onEnded?.()}
        onError={() => cbRef.current.onEnded?.()}
      />
    </div>
  )
}

// ─── Lien YouTube du distributeur ─────────────────────────────────────────────
function YoutubeTrailer({ videoId, playing, muted, onStarted, onTick, onEnded }) {
  const hostRef   = useRef(null)
  const playerRef = useRef(null)
  const apiReady  = useYouTubeApi(true)

  // Les callbacks changent à chaque rendu ; on les lit via une ref pour ne pas
  // recréer le lecteur.
  const cbRef = useRef({ onStarted, onTick, onEnded })
  cbRef.current = { onStarted, onTick, onEnded }

  useEffect(() => {
    if (!apiReady || !hostRef.current) return
    let raf = 0
    const player = new window.YT.Player(hostRef.current, {
      videoId,
      playerVars: {
        autoplay: 1, mute: 1, controls: 0, disablekb: 1, fs: 0,
        modestbranding: 1, rel: 0, playsinline: 1, iv_load_policy: 3,
        origin: window.location.origin,
      },
      events: {
        onReady: e => { e.target.mute(); e.target.playVideo() },
        onStateChange: e => {
          if (e.data === window.YT.PlayerState.PLAYING) cbRef.current.onStarted?.()
          if (e.data === window.YT.PlayerState.ENDED)   cbRef.current.onEnded?.()
        },
        // Vidéo retirée ou non intégrable : on laisse la couverture et on enchaîne.
        onError: () => cbRef.current.onEnded?.(),
      },
    })
    playerRef.current = player

    const tick = () => {
      const t = player.getCurrentTime?.()
      if (typeof t === 'number') cbRef.current.onTick?.(t)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      playerRef.current = null
      player.destroy?.()
    }
  }, [apiReady, videoId])

  useEffect(() => {
    const p = playerRef.current
    if (!p?.playVideo) return
    if (playing) p.playVideo()
    else p.pauseVideo()
  }, [playing])

  useEffect(() => {
    const p = playerRef.current
    if (!p?.mute) return
    if (muted) p.mute()
    else p.unMute()
  }, [muted])

  return (
    <div className="hero-video" aria-hidden="true">
      <div ref={hostRef} />
    </div>
  )
}

// ─── Icônes ───────────────────────────────────────────────────────────────────
const IconPlay  = () => <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M8 5v14l11-7z" /></svg>
const IconPause = () => <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M6 4h4v16H6zm8 0h4v16h-4z" /></svg>
const IconSound = () => <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 00-2.5-4.03v8.05A4.47 4.47 0 0016.5 12z" /></svg>
const IconMuted = () => <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M3 9v6h4l5 5V4L7 9H3zm18.6-1.6l-1.4-1.4L17 9.2 13.8 6l-1.4 1.4L15.6 12l-3.2 3.2 1.4 1.4L17 14.8l3.2 3.2 1.4-1.4L18.4 12l3.2-3.2z" /></svg>
const IconExpand = () => <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M4 9V4h5v2H6v3H4zm11-5h5v5h-2V6h-3V4zM4 15h2v3h3v2H4v-5zm14 0h2v5h-5v-2h3v-3z" /></svg>
const IconShrink = () => <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15"><path d="M9 4v5H4V7h3V4h2zm6 0h2v3h3v2h-5V4zM4 15h5v5H7v-3H4v-2zm11 0h5v2h-3v3h-2v-5z" /></svg>

const IconChevron = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="12" height="12" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>

// ─── Synopsis de la slide ─────────────────────────────────────────────────────
// Le synopsis est écrêté par CSS à deux ou trois lignes selon la largeur. Le
// lien « Lire la suite » n'apparaît que lorsque la coupe a réellement lieu :
// on compare la hauteur réelle du texte à celle du cadre, remesurée à chaque
// redimensionnement et une fois les polices chargées (leurs métriques
// déplacent la dernière ligne).
function HeroSynopsis({ text, title, lang, onExpand }) {
  const { t } = useI18n()
  const ref = useRef(null)
  const [clamped, setClamped] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setClamped(el.scrollHeight - el.clientHeight > 1)
    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(el)
    document.fonts?.ready.then(measure).catch(() => {})
    return () => observer.disconnect()
  }, [text])

  const nodes = flattenSynopsis(parseSynopsis(text))
  if (!nodes.length) return null

  return (
    <>
      <p className="hero-synopsis" ref={ref} lang={lang || undefined}>{renderSynopsis(nodes)}</p>
      {clamped && (
        <button
          type="button"
          className="hero-more"
          onClick={onExpand}
          aria-label={`${t('hero.readMore')} — ${title}`}
        >
          <span>{t('hero.readMore')}</span>
          <IconChevron />
        </button>
      )}
    </>
  )
}

// ─── Carrousel ────────────────────────────────────────────────────────────────
export default function HeroSlider({ films, loading, synopses, trailers, onSelectFilm }) {
  const { t, lang } = useI18n()
  const reducedMotion = usePrefersReducedMotion()

  const slides = pickHeroFilms(films, trailers)
  const count  = slides.length

  const [index, setIndex]           = useState(0)
  const [playing, setPlaying]       = useState(true)
  const [muted, setMuted]           = useState(true)
  const [videoLive, setVideoLive]   = useState(false)  // le trailer a démarré → on efface la couverture
  const [progress, setProgress]     = useState(0)      // 0 → 1
  const [fullscreen, setFullscreen] = useState(false)
  // Bande annonce ouverte en grand depuis le bouton de la slide. Réservée aux
  // fichiers déposés : une vidéo YouTube s'ouvre chez YouTube, comme avant.
  const [openTrailer, setOpenTrailer] = useState(null)

  // Le carrousel se tait pendant qu'une bande annonce est ouverte en grand :
  // deux vidéos qui se parlent dessus, et une slide qui défile sous la modale
  // pour laisser en sortant un autre film que celui qu'on regardait.
  const lecture = playing && !openTrailer

  const rootRef = useRef(null)

  // La liste de films peut changer sous nos pieds (rechargement) : on garde
  // l'index dans les bornes plutôt que de pointer une slide inexistante.
  useEffect(() => {
    if (count && index >= count) setIndex(0)
  }, [count, index])

  const active = slides[Math.min(index, Math.max(count - 1, 0))]

  const go = useCallback(next => {
    if (!count) return
    setIndex(((next % count) + count) % count)
    setVideoLive(false)
    setProgress(0)
  }, [count])

  const next = useCallback(() => go(index + 1), [go, index])
  const prev = useCallback(() => go(index - 1), [go, index])

  // Slides sans bande annonce : minuterie simple. Avec bande annonce, c'est
  // TrailerPlayer qui pilote la progression via onTick.
  useEffect(() => {
    if (!count || !lecture || reducedMotion) return
    if (active?.trailer) return
    const started = Date.now()
    const id = setInterval(() => {
      const ratio = (Date.now() - started) / IMAGE_SLIDE_MS
      if (ratio >= 1) next()
      else setProgress(ratio)
    }, 100)
    return () => clearInterval(id)
  }, [count, lecture, reducedMotion, active?.trailer, index, next])

  const handleTick = useCallback(seconds => {
    const ratio = (seconds * 1000) / VIDEO_SLIDE_MS
    if (ratio >= 1) next()
    else setProgress(ratio)
  }, [next])

  // Plein écran : API native, avec repli sur un overlay CSS (iOS Safari).
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === rootRef.current)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  function toggleFullscreen() {
    const el = rootRef.current
    if (!el) return
    if (document.fullscreenElement) {
      document.exitFullscreen?.()
    } else if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => setFullscreen(f => !f))
    } else {
      setFullscreen(f => !f)
    }
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowRight') { e.preventDefault(); next() }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); prev() }
  }

  // ─── Écran d'attente ────────────────────────────────────────────────────────
  // Le bandeau occupe le haut de l'accueil et met plusieurs secondes à se
  // remplir sur une connexion lente : ce qu'on y met pendant ce temps est la
  // première chose que voit un client. Un rectangle noir dit « panne » ; on
  // montre la salle avant la séance — l'écran sombre que balaie lentement le
  // faisceau du projecteur.
  //
  // Le contenu fantôme réutilise les classes réelles (.hero-content,
  // .hero-content-left, .hero-actions) : titre, mentions, synopsis et boutons
  // attendent exactement là où ils vont paraître, à la même géométrie et aux
  // mêmes ruptures de mise en page. La vraie slide s'y substitue sans que rien
  // ne bouge.
  if (loading) {
    return (
      <section
        className="hero-slider hero-slider--loading"
        aria-busy="true"
        aria-label={t('hero.loading')}
      >
        <div className="hero-viewport">
          <div className="hero-plate">
            <span className="hero-beam" aria-hidden="true" />
          </div>

          <div className="hero-scrim" />

          <div className="hero-content" aria-hidden="true">
            <div className="hero-content-left">
              <span className="hero-ghost hero-ghost--title" />
              <span className="hero-ghost hero-ghost--title hero-ghost--title2" />
              <span className="hero-ghost hero-ghost--meta" />
              <span className="hero-ghost hero-ghost--syn" />
              <span className="hero-ghost hero-ghost--syn hero-ghost--syn2" />
            </div>
            <div className="hero-actions">
              <span className="hero-ghost hero-ghost--cta" />
              <span className="hero-ghost hero-ghost--cta hero-ghost--cta2" />
            </div>
          </div>
        </div>
      </section>
    )
  }

  if (!count) return null

  const showVideo = lecture && !reducedMotion && !!active.trailer

  return (
    <section
      ref={rootRef}
      className={`hero-slider ${fullscreen ? 'is-fullscreen' : ''}`}
      aria-roledescription="carousel"
      aria-label={t('hero.label')}
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      <div className="hero-viewport">
        <div className="hero-track" style={{ transform: `translate3d(-${index * 100}%, 0, 0)` }}>
          {slides.map(({ film, trailer }, i) => {
            const cover     = coverImage(film, trailer)
            const isActive  = i === index
            // Le synopsis résolu dans la langue courante l'emporte sur le texte
            // brut de la fiche Veezi, qui n'est pas toujours dans la bonne langue.
            const resolu    = synopses?.[String(film.Id)]
            const synopsis  = resolu?.texte || film.Synopsis || film.ShortSynopsis || ''
            const meta      = [ratingLabel(film.Rating, t), film.Duration && formatDuration(film.Duration, lang), genreLabel(film.Genre, t)]
              .filter(Boolean).join(' · ')

            return (
              <article
                key={film.Id}
                className="hero-slide"
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} / ${count} — ${film.Title}`}
                aria-hidden={!isActive}
                inert={!isActive}
              >
                <div className={`hero-cover ${isActive && videoLive ? 'is-hidden' : ''}`}>
                  {cover.src && (
                    <img
                      src={cover.src}
                      alt=""
                      className={cover.fromYoutube ? 'hero-cover__img--youtube' : ''}
                      loading={i === 0 ? 'eager' : 'lazy'}
                      fetchPriority={i === 0 ? 'high' : 'auto'}
                    />
                  )}
                </div>

                {isActive && showVideo && (
                  <TrailerPlayer
                    trailer={trailer}
                    playing={lecture}
                    muted={muted}
                    onStarted={() => setVideoLive(true)}
                    onTick={handleTick}
                    onEnded={next}
                  />
                )}

                <div className="hero-scrim" />

                <div className="hero-content">
                  <div className="hero-content-left">
                    <h2 className="hero-title">{film.Title}</h2>
                    {meta && <p className="hero-meta">{meta}</p>}
                    <HeroSynopsis
                      text={synopsis}
                      title={film.Title}
                      lang={resolu?.langue}
                      onExpand={() => onSelectFilm?.(film)}
                    />
                  </div>

                  <div className="hero-actions">
                    <button
                      type="button"
                      className="hero-cta"
                      onClick={() => onSelectFilm?.(film)}
                    >
                      {t('hero.book')}
                    </button>
                    {/* Un fichier déposé se regarde sur place, avec le son et
                        les commandes ; un lien YouTube s'ouvre chez YouTube. */}
                    {trailer?.kind === 'fichier' && (
                      <button
                        type="button"
                        className="hero-cta hero-cta--ghost"
                        onClick={() => setOpenTrailer({ film, trailer })}
                      >
                        {t('film.trailer')}
                      </button>
                    )}
                    {trailer?.kind === 'youtube' && (
                      <a
                        className="hero-cta hero-cta--ghost"
                        href={trailer.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t('film.trailer')}
                      </a>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>

        {/* Commandes de lecture, sur la slide active */}
        <div className="hero-controls">
          <button
            type="button"
            className="hero-ctrl"
            onClick={() => setPlaying(p => !p)}
            aria-label={playing ? t('hero.pause') : t('hero.play')}
          >
            {playing ? <IconPause /> : <IconPlay />}
          </button>
          {active.trailer && (
            <button
              type="button"
              className="hero-ctrl"
              onClick={() => setMuted(m => !m)}
              aria-label={muted ? t('hero.unmute') : t('hero.mute')}
            >
              {muted ? <IconMuted /> : <IconSound />}
            </button>
          )}
          <button
            type="button"
            className="hero-ctrl"
            onClick={toggleFullscreen}
            aria-label={fullscreen ? t('hero.exitFullscreen') : t('hero.fullscreen')}
          >
            {fullscreen ? <IconShrink /> : <IconExpand />}
          </button>
        </div>

        {count > 1 && (
          <>
            <button type="button" className="hero-arrow hero-arrow--prev" onClick={prev} aria-label={t('home.prev')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <button type="button" className="hero-arrow hero-arrow--next" onClick={next} aria-label={t('home.next')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="22" height="22"><path d="M9 5l7 7-7 7" /></svg>
            </button>
          </>
        )}

        <div className="hero-progress">
          <span className="hero-progress-bar" style={{ width: `${Math.min(progress, 1) * 100}%` }} />
        </div>
      </div>

      {count > 1 && (
        <div className="hero-bullets" role="tablist" aria-label={t('hero.label')}>
          {slides.map(({ film }, i) => (
            <button
              key={film.Id}
              type="button"
              role="tab"
              className={`hero-bullet ${i === index ? 'is-active' : ''}`}
              aria-selected={i === index}
              aria-label={film.Title}
              onClick={() => go(i)}
            />
          ))}
        </div>
      )}

      {openTrailer && (
        <TrailerModal
          trailer={openTrailer.trailer}
          title={openTrailer.film.Title}
          poster={openTrailer.film.BackdropImageUrl || openTrailer.film.FilmPosterUrl}
          onClose={() => setOpenTrailer(null)}
        />
      )}
    </section>
  )
}
