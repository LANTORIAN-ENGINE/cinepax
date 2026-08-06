'use client'

import { useI18n } from '@/lib/i18n'
import { sortByPlanOrder } from '@/lib/seats'
import Aide, { AideNote } from './Aide'

// ─── Layouts hardcodés (extraits images + xlsx) ───────────────────────────────
const SCREEN_LAYOUTS = {
  1: {
    name: 'CPX MADA 1',
    totalSeats: 80,
    rows: [
      { name: 'A', groups: [[1,2,3,4,5,6,7,8], [9,10]] },
      { name: 'B', groups: [[1,2,3,4,5,6,7,8], [9,10]] },
      { name: 'C', groups: [[1,2,3,4,5,6,7,8], [9,10]] },
      { name: 'D', groups: [[1,2,3,4,5,6,7,8], [9,10]] },
      { name: 'E', groups: [[1,2,3,4,5,6,7,8], [9,10]] },
      { name: 'F', groups: [[1,2,3,4,5,6,7,8], [9,10]] },
      { name: 'G', groups: [[1,2,3,4,5,6,7,8], [9,10,11,12]] },
      { name: 'H', groups: [[1,2,3,4], [5,6,7,8]] },
    ],
  },
  2: {
    name: 'CPX MADA 2',
    totalSeats: 90,
    rows: [
      { name: 'A', groups: [[1,2,3,4,5,6,7,8], [9,10]] },
      { name: 'B', groups: [[1,2,3,4,5,6,7,8], [9,10]] },
      { name: 'C', groups: [[1,2,3,4,5,6,7,8], [9,10]] },
      { name: 'D', groups: [[1,2,3,4,5,6,7,8], [9,10]] },
      { name: 'E', groups: [[1,2,3,4,5,6,7,8], [9,10]] },
      { name: 'F', groups: [[1,2,3,4,5,6,7,8], [9,10]] },
      { name: 'G', groups: [[1,2,3,4,5,6,7,8], [9,10]] },
      { name: 'H', groups: [[1,2,3,4,5,6,7,8], [9,10,11,12]] },
      { name: 'I', groups: [[1,2], [3,4,5,6,7,8]] },
    ],
  },
  3: {
    name: 'CPX MADA 3',
    totalSeats: 74,
    rows: [
      { name: 'A', groups: [[1,2], [3,4,5,6,7,8,9,10]] },
      { name: 'B', groups: [[1,2], [3,4,5,6,7,8,9,10]] },
      { name: 'C', groups: [[1,2], [3,4,5,6,7,8,9,10]] },
      { name: 'D', groups: [[1,2], [3,4,5,6,7,8,9,10]] },
      { name: 'E', groups: [[1,2], [3,4,5,6,7,8,9,10]] },
      { name: 'F', groups: [[1,2], [3,4,5,6,7,8,9]] },
      { name: 'G', groups: [[1,2,3,4], [5,6,7,8,9]] },
      { name: 'H', groups: [[1,2,3,4,5,6]] },
    ],
  },
  4: {
    name: 'CPX MADA 4',
    totalSeats: 88,
    rows: [
      { name: 'A', groups: [[1,2,3,4,5,6,7,8], [9,10]] },
      { name: 'B', groups: [[1,2,3,4,5,6,7,8], [9,10]] },
      { name: 'C', groups: [[1,2,3,4,5,6,7,8], [9,10]] },
      { name: 'D', groups: [[1,2,3,4,5,6,7,8], [9,10]] },
      { name: 'E', groups: [[1,2,3,4,5,6,7,8], [9,10]] },
      { name: 'F', groups: [[1,2,3,4,5,6,7,8], [9,10]] },
      { name: 'G', groups: [[1,2,3,4,5,6,7,8], [9,10]] },
      { name: 'H', groups: [[1,2,3,4,5,6,7,8], [9,10,11,12]] },
      { name: 'I', groups: [[1,2,3,4,5,6]] },
    ],
  },
}

function resolveLayout(screenId, screenName) {
  const id = parseInt(screenId)
  if (SCREEN_LAYOUTS[id]) return SCREEN_LAYOUTS[id]
  for (const layout of Object.values(SCREEN_LAYOUTS)) {
    if (layout.name === screenName) return layout
  }
  return null
}

// ─── Statuts de siège Vista pris en charge dans le plan ───────────────────────
// Le seat-plan public expose : Status (0 libre / 1 occupé), Priority (type de
// siège) et SeatStyle. Les sous-statuts de vente du back-office (Assigné,
// Réservé, Retenu, Échangé) sont TOUS regroupés par l'API sous « occupé »
// (Status 1) — l'API publique ne permet pas de les distinguer au plan.
const SEAT_STATES = {
  available:   { cls: 'available',   labelKey: 'seatmap.free',        clickable: true  },
  selected:    { cls: 'selected',    labelKey: 'seatmap.selected',    clickable: true  },
  companion:   { cls: 'companion',   labelKey: 'seatmap.companion',   clickable: true  },
  wheelchair:  { cls: 'wheelchair',  labelKey: 'seatmap.wheelchair',  clickable: true  },
  occupied:    { cls: 'taken',       labelKey: 'seatmap.taken',       clickable: false }, // Assigné / Réservé / Retenu / Échangé
  house:       { cls: 'house',       labelKey: 'seatmap.house',       clickable: false },
  broken:      { cls: 'broken',      labelKey: 'seatmap.broken',      clickable: false },
  unavailable: { cls: 'unavailable', labelKey: 'seatmap.unavailable', clickable: false },
  nodata:      { cls: 'no-data',     labelKey: 'seatmap.nodata',      clickable: false },
}

// Priority (type de siège) — mapping validé pour ce tenant
function mapPriorityToName(p) {
  switch (p) {
    case 2: return 'house'
    case 3: return 'companion'
    case 4: return 'broken'
    default: return ''
  }
}

// SeatStyle (forme / accessibilité) — best effort (non utilisé sur nos salles)
function mapSeatStyle(s) {
  switch (s) {
    case 1: return 'wheelchair'
    case 2: return 'companion'
    default: return ''
  }
}

// Résout l'état d'un siège (clé de SEAT_STATES) à partir des champs Vista.
function resolveSeatState(seatData, isSelected, noApiData) {
  if (isSelected)             return 'selected'
  if (noApiData || !seatData) return 'nodata'
  const { status, priority, seatStyle } = seatData
  // Types de siège (indépendants de l'état de vente)
  if (priority === 'broken'    || status === 3) return 'broken'
  if (priority === 'house'     || status === 2) return 'house'
  if (seatStyle === 'wheelchair')               return 'wheelchair'
  if (priority === 'companion' || seatStyle === 'companion') return 'companion'
  // État de vente
  if (status === 1)  return 'occupied'      // Assigné / Réservé / Retenu / Échangé
  if (status !== 0)  return 'unavailable'   // autre code non-libre
  return 'available'
}

function buildStatusMap(seatPlanData) {
  if (!seatPlanData) return {}
  const map = {}
  const top = seatPlanData.SeatLayoutData ?? seatPlanData
  const areas = top?.Areas ?? []

  areas.forEach(area => {
    const areaNumber = area.Number ?? area.AreaNumber
    const areaCategoryCode = area.AreaCategoryCode

    ;(area.Rows ?? []).forEach(row => {
      const rowName = row.PhysicalName
      if (!rowName) return

      ;(row.Seats ?? []).forEach(seat => {
        const seatId = seat.Id ?? seat.SeatNumber
        if (seatId == null) return

        const pos = seat.Position ?? {}
        const key = `${rowName}${seatId}`
        map[key] = {
          status: seat.Status ?? 0,
          priority: mapPriorityToName(seat.Priority),
          seatStyle: mapSeatStyle(seat.SeatStyle),
          areaCategoryCode,
          areaNumber: pos.AreaNumber ?? areaNumber,
          rowIndex: pos.RowIndex ?? seat.RowIndex,
          columnIndex: pos.ColumnIndex ?? seat.ColumnIndex,
        }
      })
    })
  })
  return map
}


export default function SeatMap({ screenId, screenName, seatPlanData, selectedSeats, onToggleSeat }) {
  const { t } = useI18n()
  const layout = resolveLayout(screenId, screenName)
  const statusMap = buildStatusMap(seatPlanData)
  const noApiData = seatPlanData === null

  if (!layout) {
    return (
      <div className="seatmap-error">
        {t('seatmap.layoutError', { id: screenId })}
      </div>
    )
  }

  function isSelected(displayKey) {
    return selectedSeats.some(s => s.displayKey === displayKey)
  }

  function handleClick(rowName, seatNum, seatData, displayKey, clickable) {
    if (!clickable) return
    if (noApiData) return
    if (!seatData) return

    const seatObj = {
      displayKey,
      rowName,
      seatNumber: String(seatNum),
      areaCategoryCode: seatData.areaCategoryCode,
      areaNumber: seatData.areaNumber,
      rowIndex: seatData.rowIndex,
      columnIndex: seatData.columnIndex,
    }
    onToggleSeat(seatObj, isSelected(displayKey))
  }

  const chosen = sortByPlanOrder(selectedSeats)

  const totalFree = layout.rows.reduce((acc, row) => {
    return acc + row.groups.flat().filter(n => {
      const key = `${row.name}${n}`
      const d = statusMap[key]
      return !d || d.status === 0
    }).length
  }, 0)

  return (
    <div className="seatmap-wrap">

      {/* Le plan s'affiche même sans données — tous les sièges gris, rien de
          cliquable. Sans un mot, ce silence se lit comme une panne du site.
          C'est le cas d'une séance que le back-office n'a pas encore ouverte
          à la vente en ligne : la note le dit, et renvoie à la caisse. */}
      {noApiData && (
        <AideNote
          titre={t('aide.planVideTitre')}
          ancre="places"
          ton="attention"
          className="seatmap-aide"
        >
          {t('aide.planVideTexte')}
        </AideNote>
      )}

      {/* ── Salle ── */}
      <div className="cinema-hall">
        {/* Faisceau projecteur */}
        <div className="projector-beam" />

        {/* Écran */}
        <div className="screen-area">
          <div className="cinema-screen-bar">
            <div className="screen-surface" />
            <div className="screen-halo" />
          </div>
          <div className="screen-label">{t('seatmap.screen')}</div>

          {/* Bandeau des places choisies — l'annotation du plan, juste sous
              l'écran. Les codes sont estampés sur des silhouettes de siège :
              c'est le même objet que dans le gradin, écrit en clair. Le bloc
              garde sa hauteur à vide pour que le plan ne saute pas. */}
          <div className="seat-readout" aria-live="polite">
            {chosen.length === 0 ? (
              <p className="seat-readout-prompt">{t('seatmap.pickPrompt')}</p>
            ) : (
              <>
                <p className="seat-readout-label">{t('seatmap.yourSeats')}</p>
                <ul className="seat-readout-list">
                  {chosen.map(s => (
                    <li key={s.displayKey} className="seat-stamp">
                      {s.rowName}{s.seatNumber}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>

        {/* Gradin */}
        <div className="seating-area">
          {layout.rows.map((row, rowIdx) => (
            <div key={row.name} className="seat-row" style={{ '--row-depth': rowIdx }}>
              <span className="row-label">{row.name}</span>

              {row.groups.map((group, gIdx) => (
                <div key={gIdx} className="seat-group-wrap">
                  {gIdx > 0 && <div className="aisle" />}
                  <div className="seat-group">
                    {group.map(seatNum => {
                      const displayKey = `${row.name}${seatNum}`
                      const seatData   = statusMap[displayKey]
                      const sel        = isSelected(displayKey)
                      const stateId    = resolveSeatState(seatData, sel, noApiData)
                      const state      = SEAT_STATES[stateId]
                      const clickable  = state.clickable && !noApiData && !!seatData

                      return (
                        <button
                          type="button"
                          key={seatNum}
                          className={`seat ${state.cls}`}
                          title={`${displayKey} — ${t(state.labelKey)}`}
                          aria-label={`${displayKey} — ${t(state.labelKey)}`}
                          aria-pressed={clickable ? sel : undefined}
                          aria-disabled={clickable ? undefined : true}
                          tabIndex={clickable ? 0 : -1}
                          onClick={() => handleClick(row.name, seatNum, seatData, displayKey, clickable)}
                        >
                          <span className="seat-num">{seatNum}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              <span className="row-label">{row.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Légende + compteur ── */}
      <div className="seatmap-footer">
        <div className="legend">
          {[
            { cls: 'available',   key: 'seatmap.free'        },
            { cls: 'selected',    key: 'seatmap.selected'    },
            { cls: 'taken',       key: 'seatmap.taken'       },
            { cls: 'companion',   key: 'seatmap.companion'   },
            { cls: 'wheelchair',  key: 'seatmap.wheelchair'  },
            { cls: 'house',       key: 'seatmap.house'       },
            { cls: 'broken',      key: 'seatmap.broken'      },
            { cls: 'unavailable', key: 'seatmap.unavailable' },
          ].map(({ cls, key }) => (
            <div key={cls} className="legend-item">
              <div className={`legend-chip seat-chip--${cls}`} />
              <span>{t(key)}</span>
            </div>
          ))}
          {/* « Maison », « Companion » : la légende nomme les états sans les
              expliquer. Le repère complète, sans allonger la rangée. */}
          <Aide titre={t('aide.legendeTitre')} ancre="places" className="legend-aide">
            <p>{t('aide.legendeTexte')}</p>
          </Aide>
        </div>
        {!noApiData && (
          <div className="seat-counter">
            <span className="counter-free">{totalFree}</span>
            <span className="counter-label"> {t('seatmap.freeCount', { count: totalFree })}</span>
            <span className="counter-sep"> / </span>
            <span className="counter-total">{layout.totalSeats}</span>
          </div>
        )}
      </div>

    </div>
  )
}
