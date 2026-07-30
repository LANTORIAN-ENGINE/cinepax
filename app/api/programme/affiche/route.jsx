// Affiche du programme — image 1080×1920 générée depuis Veezi.
//
// Équivalent de la vignette que cinepax.mg dépose chaque semaine dans son CMS,
// à ceci près qu'elle n'est pas déposée : elle se compose à partir de
// /v1/session et /v4/film, se régénère à chaque révalidation et ne peut donc
// pas se périmer. Elle est téléchargeable et partageable — c'est l'usage réel
// de ce genre d'affiche, qui circule sur Facebook et WhatsApp.
//
// ImageResponse (Satori) est fourni par Next : pas de dépendance ajoutée.
// Satori ne gère que flexbox — pas de grid, et tout conteneur à plusieurs
// enfants doit porter display:flex explicitement.

import { ImageResponse } from 'next/og'
import { fetchProgramme, groupForPoster, weekRange } from '@/lib/programme'

export const revalidate = 900

const W = 1080
const H = 1920

// Reprend les jetons de l'interface : fond chaud très sombre, rouge Cinepax.
const INK      = '#F7F2EF'
const INK_2    = '#B9ABA4'
const INK_3    = '#8A7B74'
const BG       = '#141010'
const PANEL    = '#1E1817'
const LINE     = '#332A28'
const ACCENT   = '#FF3044'

const MAX_FILMS = 10   // au-delà, l'affiche devient illisible à ce format

export async function GET() {
  if (!process.env.VEEZI_TOKEN) {
    return new Response('VEEZI_TOKEN manquant', { status: 500 })
  }

  let films = []
  let range = ''
  try {
    const data = await fetchProgramme({ days: 7, revalidate })
    films = groupForPoster(data).slice(0, MAX_FILMS)
    range = weekRange(data.sessions) || ''
  } catch (err) {
    return new Response(`Programme indisponible : ${err.message}`, { status: 502 })
  }

  // Deux colonnes : au-delà de 6 films la grille passe en rangées plus serrées.
  const dense = films.length > 6
  const posterW = dense ? 104 : 132
  const posterH = Math.round(posterW * 1.5)
  // Moins de films → plus de créneaux par film : l'affiche se remplit au lieu
  // de masquer des horaires sous un « + N autres » sur une page à moitié vide.
  const slotCap = films.length <= 4 ? 9 : films.length <= 6 ? 7 : 5

  return new ImageResponse(
    (
      <div
        style={{
          width: W, height: H, display: 'flex', flexDirection: 'column',
          backgroundColor: BG, color: INK,
          fontFamily: 'sans-serif',
        }}
      >
        {/* ── En-tête ─────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
            padding: '56px 60px 34px', borderBottom: `2px solid ${ACCENT}`,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                fontSize: 76, fontWeight: 800, letterSpacing: -2,
                lineHeight: 1, color: INK,
              }}
            >
              PROGRAMME
            </div>
            {range && (
              <div style={{ fontSize: 28, color: ACCENT, marginTop: 12, fontWeight: 600 }}>
                {range}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1, color: INK }}>
              Cinepax
            </div>
            <div style={{ fontSize: 20, color: INK_3, marginTop: 4 }}>Madagascar</div>
          </div>
        </div>

        {/* ── Films ───────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex', flexWrap: 'wrap', flex: 1,
            padding: '30px 46px 10px',
            // Répartit les rangées sur la hauteur restante : à 10 films les
            // cartes ne remplissent pas le format, autant étaler que laisser
            // un tiers de l'affiche vide.
            alignContent: 'space-between',
          }}
        >
          {films.map(film => (
            <div
              key={film.title}
              style={{
                display: 'flex', width: (W - 92) / 2 - 12, margin: '0 6px 26px',
                padding: 14, backgroundColor: PANEL, borderRadius: 14,
                border: `1px solid ${LINE}`,
              }}
            >
              {film.poster && (
                <img
                  src={film.poster}
                  width={posterW}
                  height={posterH}
                  style={{ borderRadius: 8, objectFit: 'cover', marginRight: 14 }}
                />
              )}

              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: dense ? 20 : 23, fontWeight: 800, color: ACCENT,
                    lineHeight: 1.15, marginBottom: 8,
                  }}
                >
                  {film.title}
                </div>

                {film.slots.slice(0, slotCap).map((slot, i) => (
                  <div
                    key={i}
                    style={{ display: 'flex', flexDirection: 'column', marginBottom: 7 }}
                  >
                    <div style={{ fontSize: 14, color: INK_3, lineHeight: 1.2 }}>
                      {slot.days.join(' ')}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ fontSize: dense ? 21 : 24, fontWeight: 800, color: INK }}>
                        {slot.time}
                      </div>
                      {slot.version && (
                        <div
                          style={{
                            fontSize: 13, fontWeight: 700, color: INK_2,
                            marginLeft: 9, padding: '2px 8px',
                            border: `1px solid ${LINE}`, borderRadius: 5,
                          }}
                        >
                          {slot.version}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {film.slots.length > slotCap && (
                  <div style={{ display: 'flex', fontSize: 14, color: INK_3 }}>
                    {film.slots.length - slotCap === 1
                      ? '+ 1 autre horaire'
                      : `+ ${film.slots.length - slotCap} autres horaires`}
                  </div>
                )}
              </div>
            </div>
          ))}

          {films.length === 0 && (
            <div style={{ display: 'flex', fontSize: 28, color: INK_3, padding: 40 }}>
              Aucune séance programmée cette semaine.
            </div>
          )}
        </div>

        {/* ── Pied ────────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '26px 60px 34px', borderTop: `1px solid ${LINE}`,
            backgroundColor: PANEL,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 21, color: INK, fontWeight: 700 }}>
              Tana Water Front, Antananarivo
            </div>
            <div style={{ fontSize: 18, color: INK_3, marginTop: 5 }}>
              contact@cinepax.mg
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ fontSize: 21, color: ACCENT, fontWeight: 700 }}>
              +261 34 05 735 01
            </div>
            <div style={{ fontSize: 18, color: INK_3, marginTop: 5 }}>
              Réservation en ligne
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      headers: {
        'Cache-Control': `public, max-age=0, s-maxage=${revalidate}, stale-while-revalidate=3600`,
      },
    }
  )
}
