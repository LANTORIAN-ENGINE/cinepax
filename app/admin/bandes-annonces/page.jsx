'use client'
import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { fixImageUrl } from '@/lib/images'
import { IconAlert, IconCheck, IconTrash } from '@/components/icons'
import { TrailerModal } from '@/components/BandeAnnonce'
import {
  ACCEPT_VIDEO, TAILLE_MAX, formatAccepte, formaterOctets, formaterDuree,
  cheminStockage, youtubeId, lireLigne, bandeAnnonce, indexerBandesAnnonces,
} from '@/lib/bandesAnnonces'

// ─── Bandes annonces ──────────────────────────────────────────────────────────
//
// Jusqu'ici, la bande annonce d'un film n'avait qu'une source : le lien YouTube
// que le distributeur a saisi dans Veezi. Le cinéma ne peut pas l'y corriger —
// il n'écrit pas dans Veezi — et le champ est souvent vide. Cet écran ouvre la
// seconde source : un fichier vidéo, déposé ici, qui l'emporte sur le lien.
//
// Rien n'est obligatoire : un film sans ligne garde son lien Veezi. C'est
// pourquoi la liste montre d'abord ce que Veezi propose déjà, film par film —
// on ne dépose que là où il manque quelque chose, ou là où ce qui vient de
// Veezi ne convient pas.
//
// Le fichier ne passe pas par le serveur : une fonction Vercel refuse un corps
// de requête au-delà de 4,5 Mo, quand une bande annonce en pèse cinquante ou
// cent. Le navigateur écrit donc directement dans le bucket Supabase avec le
// jeton de session de l'administrateur, puis la route d'administration
// enregistre le chemin obtenu.

const BUCKET = 'film-trailers'

// ─── Dépôt du fichier ─────────────────────────────────────────────────────────
// XMLHttpRequest et non fetch : c'est le seul moyen d'avoir l'avancement du
// téléversement. Sur quatre-vingts mégaoctets, une barre qui avance est la
// différence entre « ça travaille » et « c'est planté ».
//
// Le corps reprend exactement la forme qu'envoie supabase-js — multipart, un
// champ cacheControl et le fichier sous un nom vide : c'est ce que l'API de
// stockage attend.
function deposerFichier({ fichier, chemin, token, onProgress }) {
  return new Promise((resolve, reject) => {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!base || !anon) { reject(new Error('config')); return }

    const corps = new FormData()
    corps.append('cacheControl', '3600')
    corps.append('', fichier)

    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${base}/storage/v1/object/${BUCKET}/${chemin}`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('apikey', anon)
    xhr.setRequestHeader('x-upsert', 'true')

    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { resolve(chemin); return }
      let detail = ''
      try { detail = JSON.parse(xhr.responseText)?.message || '' } catch { /* réponse non JSON */ }
      // 413 : le plafond du projet Supabase, qui l'emporte sur celui du bucket.
      reject(new Error(xhr.status === 413 ? 'trop_lourd' : detail || `http_${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error('reseau'))
    xhr.send(corps)
  })
}

// ─── Ce qu'un film a aujourd'hui ──────────────────────────────────────────────
// Trois états, et un seul mot pour chacun : un fichier déposé ici, le lien du
// distributeur, ou rien du tout.
function etatDuFilm(film, ligne) {
  if (ligne?.enabled && ligne.videoUrl) return 'fichier'
  if (ligne?.enabled && youtubeId(ligne.youtubeUrl)) return 'lien'
  if (film.veeziVideoId) return 'veezi'
  return 'aucune'
}

// ─── Une ligne de la liste ────────────────────────────────────────────────────
function LigneFilm({ film, ligne, ouvert, onOuvrir, onApercu }) {
  const { t, lang } = useI18n()
  const etat = etatDuFilm(film, ligne)
  const poster = fixImageUrl(film.poster)

  return (
    <div className={`aba-row ${ouvert ? 'is-open' : ''}`}>
      <button type="button" className="aba-row-main" onClick={onOuvrir} aria-expanded={ouvert}>
        <span className="aba-poster">
          {poster
            ? <img src={poster} alt="" loading="lazy" />
            : <span className="aba-poster-vide">{String(film.title).charAt(0)}</span>}
        </span>

        <span className="aba-row-text">
          <span className="aba-row-title">{film.title}</span>
          <span className="aba-row-meta">
            {film.onScreen && <span className="aba-tag aba-tag--live">{t('adminTrailers.onScreen')}</span>}
            {!film.onScreen && film.comingSoon && (
              <span className="aba-tag">{t('adminTrailers.comingSoon')}</span>
            )}
            {ligne && !ligne.enabled && <span className="aba-tag aba-tag--off">{t('adminTrailers.disabled')}</span>}
          </span>
        </span>

        <span className={`aba-state aba-state--${etat}`}>
          <span className="aba-state-dot" aria-hidden="true" />
          <span className="aba-state-text">
            <span className="aba-state-label">{t(`adminTrailers.state.${etat}`)}</span>
            {etat === 'fichier' && (
              <span className="aba-state-detail">
                {[ligne.videoName, formaterOctets(ligne.videoSize, lang), formaterDuree(ligne.duration)]
                  .filter(Boolean).join(' · ')}
              </span>
            )}
            {etat === 'lien' && <span className="aba-state-detail">{ligne.youtubeUrl}</span>}
            {etat === 'veezi' && <span className="aba-state-detail">{film.trailerUrl}</span>}
          </span>
        </span>
      </button>

      <div className="aba-row-actions">
        {etat !== 'aucune' && (
          <button type="button" className="aba-mini" onClick={onApercu}>
            {t('adminTrailers.preview')}
          </button>
        )}
        <button type="button" className="aba-mini aba-mini--strong" onClick={onOuvrir}>
          {ligne ? t('adminTrailers.edit') : t('adminTrailers.add')}
        </button>
      </div>
    </div>
  )
}

// ─── L'éditeur d'un film ──────────────────────────────────────────────────────
// Déclaré au module, jamais dans le corps de la page : une fonction composant
// définie à l'intérieur d'une autre change d'identité à chaque rendu, et React
// remonte alors tout son sous-arbre — ici, le <video> d'aperçu, qui reprendrait
// au début à chaque frappe dans le champ du lien.
function Editeur({ film, ligne, token, onEnregistre, onSupprime, onFermer }) {
  const { t, lang } = useI18n()

  const [fichier, setFichier]   = useState(null)
  // Passer d'une vidéo déposée à un simple lien sans effacer toute la ligne :
  // sans cette bascule, il faudrait retirer la bande annonce puis la refaire.
  const [fichierRetire, setFichierRetire] = useState(false)
  const [apercu, setApercu]     = useState(null)   // URL locale du fichier choisi
  const [duree, setDuree]       = useState(ligne?.duration ?? null)
  const [lisible, setLisible]   = useState(null)   // null = pas encore su
  const [lien, setLien]         = useState(ligne?.youtubeUrl || '')
  const [versions, setVersions] = useState(ligne ? ligne.versions : true)
  const [actif, setActif]       = useState(ligne ? ligne.enabled : true)

  const [progression, setProgression] = useState(null)
  const [enCours, setEnCours]         = useState(false)
  const [erreur, setErreur]           = useState(null)

  const inputRef = useRef(null)

  // L'URL locale doit être révoquée, sinon le fichier reste en mémoire du
  // navigateur pour toute la visite — quatre-vingts mégaoctets par essai.
  useEffect(() => () => { if (apercu) URL.revokeObjectURL(apercu) }, [apercu])

  // Le conteneur ne dit pas tout : un .mp4 en HEVC ou un .mov en ProRes passent
  // le contrôle de type et restent noirs à l'écran. Seul le navigateur sait
  // vraiment lire — on le lui demande avant le dépôt, pas après.
  function choisir(f) {
    setErreur(null)
    if (!f) return
    if (!formatAccepte(f)) { setErreur(t('adminTrailers.errFormat')); return }
    if (f.size > TAILLE_MAX) { setErreur(t('adminTrailers.errSize', { max: formaterOctets(TAILLE_MAX) })); return }

    if (apercu) URL.revokeObjectURL(apercu)
    const url = URL.createObjectURL(f)
    setFichier(f)
    setFichierRetire(false)
    setApercu(url)
    setLisible(null)
    setDuree(null)

    const sonde = document.createElement('video')
    sonde.preload = 'metadata'
    sonde.onloadedmetadata = () => {
      setDuree(Number.isFinite(sonde.duration) ? sonde.duration : null)
      setLisible(true)
    }
    sonde.onerror = () => setLisible(false)
    sonde.src = url
  }

  async function enregistrer() {
    setErreur(null)
    const lienPropre = lien.trim()
    if (lienPropre && !youtubeId(lienPropre)) { setErreur(t('adminTrailers.errLink')); return }

    // Une ligne qui ne porte ni fichier ni lien ne décide de rien : la table le
    // refuse, autant le dire ici plutôt que de laisser remonter une erreur SQL.
    const dejaPose = ligne?.videoPath && !fichier && !fichierRetire
    if (!fichier && !dejaPose && !lienPropre) { setErreur(t('adminTrailers.errEmpty')); return }

    setEnCours(true)
    try {
      let corps = {
        filmId: film.id,
        filmTitle: film.title,
        titleKey: film.titleKey || film.title,
        youtubeUrl: lienPropre || null,
        versions,
        enabled: actif,
      }

      if (fichier) {
        const chemin = cheminStockage(film.id, fichier.name)
        setProgression(0)
        await deposerFichier({ fichier, chemin, token, onProgress: setProgression })
        setProgression(1)
        corps = {
          ...corps,
          videoPath: chemin,
          videoMime: fichier.type || null,
          videoSize: fichier.size,
          videoName: fichier.name,
          duration: duree,
        }
      } else if (dejaPose) {
        // Réenregistrement sans nouveau fichier : on repose le même, sinon la
        // route comprendrait qu'on veut le retirer.
        corps = {
          ...corps,
          videoPath: ligne.videoPath,
          videoMime: ligne.videoMime,
          videoSize: ligne.videoSize,
          videoName: ligne.videoName,
          duration: ligne.duration,
        }
      }

      const res = await fetch('/api/admin/bandes-annonces', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(corps),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'echec')

      onEnregistre(data.trailer)
    } catch (e) {
      const cles = {
        trop_lourd: 'errTooLarge',
        reseau: 'errNetwork',
        config: 'errConfig',
        fichier_introuvable: 'errUploadLost',
        lien_illisible: 'errLink',
      }
      setErreur(t(`adminTrailers.${cles[e.message] || 'errSave'}`))
    } finally {
      setEnCours(false)
      setProgression(null)
    }
  }

  async function supprimer() {
    setEnCours(true)
    setErreur(null)
    try {
      const res = await fetch(`/api/admin/bandes-annonces?filmId=${encodeURIComponent(film.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('echec')
      onSupprime(film.id)
    } catch {
      setErreur(t('adminTrailers.errDelete'))
    } finally {
      setEnCours(false)
    }
  }

  const source = fichier ? 'nouveau' : (ligne?.videoPath && !fichierRetire ? 'depose' : null)

  return (
    <div className="aba-edit">
      {/* ── Le fichier ─────────────────────────────────────────── */}
      <div className="aba-edit-block">
        <p className="aba-edit-label">{t('adminTrailers.fileTitle')}</p>
        <p className="aba-edit-hint">{t('adminTrailers.fileHint')}</p>

        <div className="aba-drop">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_VIDEO}
            className="aba-file-input"
            onChange={e => choisir(e.target.files?.[0])}
          />
          <button
            type="button"
            className="aba-choose"
            onClick={() => inputRef.current?.click()}
            disabled={enCours}
          >
            {source ? t('adminTrailers.replaceFile') : t('adminTrailers.chooseFile')}
          </button>

          {source === 'nouveau' && (
            <span className="aba-file-name">
              {[fichier.name, formaterOctets(fichier.size, lang), formaterDuree(duree)]
                .filter(Boolean).join(' · ')}
            </span>
          )}
          {source === 'depose' && (
            <span className="aba-file-name">
              {[ligne.videoName, formaterOctets(ligne.videoSize, lang), formaterDuree(ligne.duration)]
                .filter(Boolean).join(' · ')}
            </span>
          )}
          {!source && <span className="aba-file-name aba-file-name--vide">{t('adminTrailers.noFile')}</span>}

          {source && (
            <button
              type="button"
              className="aba-drop-off"
              onClick={() => {
                if (apercu) URL.revokeObjectURL(apercu)
                setApercu(null); setFichier(null); setLisible(null)
                setFichierRetire(true)
              }}
              disabled={enCours}
            >
              {t('adminTrailers.dropFile')}
            </button>
          )}
        </div>

        {/* Le verdict du navigateur sur le fichier choisi. */}
        {lisible === false && (
          <p className="aba-warn" role="alert"><IconAlert size={15} />{t('adminTrailers.errUnplayable')}</p>
        )}

        {apercu && lisible !== false && (
          <video className="aba-apercu" src={apercu} controls preload="metadata" />
        )}
        {!apercu && ligne?.videoUrl && !fichierRetire && (
          <video className="aba-apercu" src={ligne.videoUrl} controls preload="metadata" />
        )}

        {progression != null && (
          <div className="aba-progress" role="progressbar" aria-valuenow={Math.round(progression * 100)}>
            <span className="aba-progress-bar" style={{ width: `${progression * 100}%` }} />
            <span className="aba-progress-text">
              {t('adminTrailers.uploading', { pct: Math.round(progression * 100) })}
            </span>
          </div>
        )}
      </div>

      {/* ── Le lien de remplacement ────────────────────────────── */}
      <div className="aba-edit-block">
        <p className="aba-edit-label">{t('adminTrailers.linkTitle')}</p>
        <p className="aba-edit-hint">{t('adminTrailers.linkHint')}</p>
        <input
          type="url"
          className="aba-input"
          value={lien}
          placeholder="https://www.youtube.com/watch?v=…"
          onChange={e => setLien(e.target.value)}
        />
        {film.trailerUrl && (
          <p className="aba-veezi">
            {t('adminTrailers.veeziCurrent')}
            <a href={film.trailerUrl} target="_blank" rel="noreferrer">{film.trailerUrl}</a>
          </p>
        )}
      </div>

      {/* ── Portée et activation ───────────────────────────────── */}
      <div className="aba-edit-block">
        <label className="aset-toggle">
          <input type="checkbox" checked={versions} onChange={e => setVersions(e.target.checked)} />
          <span className="aset-toggle-track" aria-hidden="true"><span className="aset-toggle-knob" /></span>
          <span className="aset-toggle-label">{t('adminTrailers.versions')}</span>
        </label>
        <p className="aba-edit-hint">
          {versions
            ? t('adminTrailers.versionsOn', { key: film.titleKey })
            : t('adminTrailers.versionsOff')}
        </p>

        <label className="aset-toggle">
          <input type="checkbox" checked={actif} onChange={e => setActif(e.target.checked)} />
          <span className="aset-toggle-track" aria-hidden="true"><span className="aset-toggle-knob" /></span>
          <span className="aset-toggle-label">{t('adminTrailers.active')}</span>
        </label>
        <p className="aba-edit-hint">
          {actif ? t('adminTrailers.activeOn') : t('adminTrailers.activeOff')}
        </p>
      </div>

      {erreur && <p className="aset-error" role="alert"><IconAlert size={15} />{erreur}</p>}

      <div className="aba-edit-foot">
        {ligne && (
          <button type="button" className="aba-delete" onClick={supprimer} disabled={enCours}>
            <IconTrash size={14} />{t('adminTrailers.remove')}
          </button>
        )}
        <span className="aba-edit-spacer" />
        <button type="button" className="aba-mini" onClick={onFermer} disabled={enCours}>
          {t('adminTrailers.cancel')}
        </button>
        <button type="button" className="aset-save" onClick={enregistrer} disabled={enCours || !token}>
          {enCours ? t('adminTrailers.saving') : t('adminTrailers.save')}
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AdminBandesAnnonces() {
  const { t } = useI18n()

  const [token, setToken]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  const [error, setError]     = useState(null)

  const [films, setFilms]       = useState([])
  const [lignes, setLignes]     = useState([])   // lignes normalisées
  const [veeziErr, setVeeziErr] = useState(null)

  const [q, setQ]           = useState('')
  const [filtre, setFiltre] = useState('affiche')
  const [ouvert, setOuvert] = useState(null)     // film.id en cours d'édition
  const [apercu, setApercu] = useState(null)     // { film, trailer }
  const [saved, setSaved]   = useState(null)     // film.id venant d'être enregistré

  const charger = useCallback(async jeton => {
    const res  = await fetch('/api/admin/bandes-annonces', { headers: { Authorization: `Bearer ${jeton}` } })
    const data = await res.json().catch(() => ({}))

    if (res.status === 503 && data.error === 'table_absente') setMissing(true)
    else if (!res.ok) setError(t('adminTrailers.errLoad'))

    setFilms(data.films || [])
    setLignes((data.trailers || []).map(lireLigne).filter(Boolean))
    setVeeziErr(data.veeziErreur || null)
    setLoading(false)
  }, [t])

  useEffect(() => {
    const supabase = createClient()
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(({ data: { session } }) => {
      const jeton = session?.access_token || null
      setToken(jeton)
      if (!jeton) { setLoading(false); return }
      charger(jeton)
    })
  }, [charger])

  const parId = useMemo(() => new Map(lignes.map(l => [l.filmId, l])), [lignes])

  // Index complet (fiche + œuvre) : c'est lui qui dit ce que le site jouera
  // réellement sur un film qui n'a pas de ligne à lui mais dont la VF en a une.
  const index = useMemo(() => indexerBandesAnnonces(lignes), [lignes])

  const visibles = useMemo(() => {
    const terme = q.trim().toLowerCase()
    return films.filter(f => {
      if (terme && !String(f.title).toLowerCase().includes(terme)) return false
      if (filtre === 'affiche')       return f.onScreen
      if (filtre === 'prochainement') return f.comingSoon
      if (filtre === 'posees')        return parId.has(f.id)
      if (filtre === 'manquantes')    return !parId.has(f.id) && !f.veeziVideoId
      return true
    })
  }, [films, q, filtre, parId])

  const compteurs = useMemo(() => ({
    posees:     films.filter(f => parId.has(f.id)).length,
    manquantes: films.filter(f => !parId.has(f.id) && !f.veeziVideoId && (f.onScreen || f.comingSoon)).length,
  }), [films, parId])

  function apresEnregistrement(row) {
    const ligne = lireLigne(row)
    setLignes(prev => [ligne, ...prev.filter(l => l.filmId !== ligne.filmId)])
    setOuvert(null)
    setSaved(ligne.filmId)
    setTimeout(() => setSaved(null), 4000)
  }

  function apresSuppression(filmId) {
    setLignes(prev => prev.filter(l => l.filmId !== filmId))
    setOuvert(null)
  }

  const ONGLETS = ['affiche', 'prochainement', 'posees', 'manquantes', 'tous']

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">{t('adminTrailers.title')}</h1>
        <p className="admin-page-subtitle">{t('adminTrailers.subtitle')}</p>
      </div>

      {missing && (
        <div className="aset-warn" role="alert">
          <IconAlert size={16} />
          <span>{t('adminTrailers.errMigration')} <code>supabase/migration_bandes_annonces.sql</code></span>
        </div>
      )}

      {veeziErr && (
        <div className="aset-warn" role="alert">
          <IconAlert size={16} />
          <span>{t('adminTrailers.errVeezi')}</span>
        </div>
      )}

      {loading ? (
        <div className="aset-loading" aria-hidden="true">
          <div className="sk-shine" style={{ height: 54, borderRadius: 10 }} />
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="sk-shine" style={{ height: 76, borderRadius: 10, marginTop: 12 }} />
          ))}
        </div>
      ) : (
        <>
          <div className="admin-filters-row">
            <div className="admin-filter-tabs">
              {ONGLETS.map(cle => (
                <button
                  key={cle}
                  type="button"
                  className={`admin-filter-tab ${filtre === cle ? 'active' : ''}`}
                  onClick={() => { setFiltre(cle); setOuvert(null) }}
                >
                  {t(`adminTrailers.tab.${cle}`)}
                  {cle === 'posees' && compteurs.posees > 0 && (
                    <span className="aba-count">{compteurs.posees}</span>
                  )}
                  {cle === 'manquantes' && compteurs.manquantes > 0 && (
                    <span className="aba-count">{compteurs.manquantes}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="admin-search-form">
              <input
                className="admin-search-input"
                type="search"
                value={q}
                placeholder={t('adminTrailers.search')}
                onChange={e => setQ(e.target.value)}
              />
            </div>
          </div>

          {visibles.length === 0 && <p className="admin-empty">{t('adminTrailers.empty')}</p>}

          <div className="aba-list">
            {visibles.map(film => {
              const ligne = parId.get(film.id) || null
              return (
                <div key={film.id} className="aba-item">
                  <LigneFilm
                    film={film}
                    ligne={ligne}
                    ouvert={ouvert === film.id}
                    onOuvrir={() => setOuvert(o => (o === film.id ? null : film.id))}
                    onApercu={() => setApercu({ film, trailer: bandeAnnonce(film, index) })}
                  />

                  {saved === film.id && (
                    <p className="aba-saved"><IconCheck size={14} />{t('adminTrailers.saved')}</p>
                  )}

                  {ouvert === film.id && (
                    <Editeur
                      film={film}
                      ligne={ligne}
                      token={token}
                      onEnregistre={apresEnregistrement}
                      onSupprime={apresSuppression}
                      onFermer={() => setOuvert(null)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {error && <p className="aset-error" role="alert"><IconAlert size={15} />{error}</p>}

      {apercu?.trailer && (
        <TrailerModal
          trailer={apercu.trailer}
          title={apercu.film.title}
          poster={apercu.film.backdrop ? fixImageUrl(apercu.film.backdrop) : null}
          onClose={() => setApercu(null)}
        />
      )}
    </div>
  )
}
