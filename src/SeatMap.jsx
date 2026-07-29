/**
 * SeatMap — Plan de salle interactif Cinepax
 *
 * Combine un layout hardcodé exact (extrait des captures Veezi POS)
 * avec les statuts live retournés par le Connect API (seat-plan).
 *
 * Props :
 *   screenId      : numéro de salle (1-4) depuis selectedSession.ScreenId
 *   screenName    : nom lisible (ex. "CPX MADA 3") pour fallback
 *   seatPlanData  : réponse brute de /RESTData.svc/.../seat-plan (null = pas encore chargé)
 *   selectedSeats : [{ displayKey, areaCategoryCode, areaNumber, rowIndex, columnIndex }]
 *   onToggleSeat  : (seatObj, isCurrentlySelected) => void
 */

// ─── Layouts hardcodés (extraits images + xlsx) ───────────────────────────────
// groups : tableau de blocs de sièges séparés par des allées
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
      // Attention : sur la salle 3 les petits numéros (1,2) sont à GAUCHE
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

// ─── Résolution du layout ────────────────────────────────────────────────────
function resolveLayout(screenId, screenName) {
  const id = parseInt(screenId)
  if (SCREEN_LAYOUTS[id]) return SCREEN_LAYOUTS[id]
  // Fallback par nom (ex: "CPX MADA 2")
  for (const layout of Object.values(SCREEN_LAYOUTS)) {
    if (layout.name === screenName) return layout
  }
  return null
}

// ─── Mapping Priority (entier Veezi) → nom canonique ─────────────────────────
// Valeurs observées : 0/1 = standard, 2 = house, 3 = companion, 4 = broken
function mapPriorityToName(p) {
  switch (p) {
    case 2: return 'house'
    case 3: return 'companion'
    case 4: return 'broken'
    default: return ''   // 0, 1 ou inconnu → siège standard
  }
}

// ─── Construction du map statut à partir des données API ─────────────────────
// Clé : "${rowLetter}${seatId}" ex: "A1", "H10"
// Valeur : coordonnées Veezi + statut
//
// Structure réelle Veezi Connect (différente de ce qu'on supposait) :
//   area.Number          (pas AreaNumber)
//   seat.Id              (pas SeatNumber)
//   seat.Priority        (entier, pas SeatPriorityName string)
//   seat.Position.RowIndex / ColumnIndex / AreaNumber  (objet imbriqué)
function buildStatusMap(seatPlanData) {
  if (!seatPlanData) return {}
  const map = {}
  const top = seatPlanData.SeatLayoutData ?? seatPlanData
  const areas = top?.Areas ?? []

  areas.forEach(area => {
    const areaNumber     = area.Number ?? area.AreaNumber
    const areaCategoryCode = area.AreaCategoryCode

    ;(area.Rows ?? []).forEach(row => {
      const rowName = row.PhysicalName
      if (!rowName) return   // rows fantômes sans lettre (ex: null, padding)

      ;(row.Seats ?? []).forEach(seat => {
        // L'API renvoie l'Id du siège dans seat.Id (string), pas seat.SeatNumber
        const seatId = seat.Id ?? seat.SeatNumber
        if (seatId == null) return

        // Les coordonnées de position sont dans un objet imbriqué seat.Position
        const pos = seat.Position ?? {}

        const key = `${rowName}${seatId}`
        map[key] = {
          status:            seat.Status ?? 0,
          priority:          mapPriorityToName(seat.Priority),
          areaCategoryCode,
          areaNumber:        pos.AreaNumber ?? areaNumber,
          rowIndex:          pos.RowIndex ?? seat.RowIndex,
          columnIndex:       pos.ColumnIndex ?? seat.ColumnIndex,
        }
      })
    })
  })
  return map
}

// ─── Classe CSS d'un siège ────────────────────────────────────────────────────
function seatClass(seatData, isSelected, noApiData) {
  if (isSelected) return 'seat selected'
  if (noApiData)  return 'seat no-data'   // API pas encore chargée
  if (!seatData)  return 'seat no-data'   // siège du layout absent de l'API (non cliquable)
  const s = seatData.status
  const p = seatData.priority
  if (s === 1)                   return 'seat taken'
  if (s === 2 || p === 'house')  return 'seat house'
  if (s === 3 || p === 'broken') return 'seat broken'
  if (p === 'companion')         return 'seat companion'
  return 'seat available'
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function SeatMap({ screenId, screenName, seatPlanData, selectedSeats, onToggleSeat }) {
  const layout = resolveLayout(screenId, screenName)
  const statusMap = buildStatusMap(seatPlanData)
  const noApiData = seatPlanData === null

  if (!layout) {
    return (
      <div className="seatmap-error">
        Layout de salle introuvable pour la salle #{screenId}.
      </div>
    )
  }

  function isSelected(displayKey) {
    return selectedSeats.some(s => s.displayKey === displayKey)
  }

  function handleClick(rowName, seatNum, seatData, displayKey, cls) {
    if (cls === 'seat taken' || cls === 'seat house' || cls === 'seat broken') return
    if (noApiData) return
    if (!seatData) return  // siège pas connu de l'API

    const seatObj = {
      displayKey,                          // "A1" pour affichage
      rowName,                             // "A"
      seatNumber: String(seatNum),         // "1"
      areaCategoryCode: seatData.areaCategoryCode,
      areaNumber: seatData.areaNumber,
      rowIndex: seatData.rowIndex,
      columnIndex: seatData.columnIndex,
    }
    onToggleSeat(seatObj, isSelected(displayKey))
  }

  // Compter les libres restants
  const totalFree = layout.rows.reduce((acc, row) => {
    return acc + row.groups.flat().filter(n => {
      const key = `${row.name}${n}`
      const d = statusMap[key]
      return !d || d.status === 0
    }).length
  }, 0)

  return (
    <div className="seatmap-wrap">
      {/* ── Écran ── */}
      <div className="cinema-screen-bar">
        <span>É C R A N</span>
      </div>

      {/* ── Plan de salle ── */}
      <div className="seating-area">
        {layout.rows.map(row => (
          <div key={row.name} className="seat-row">
            {/* Label gauche */}
            <span className="row-label">{row.name}</span>

            {/* Groupes de sièges + allées */}
            {row.groups.map((group, gIdx) => (
              <div key={gIdx} className="seat-group-wrap">
                {/* Allée entre les groupes */}
                {gIdx > 0 && <div className="aisle" />}

                {/* Sièges du groupe */}
                <div className="seat-group">
                  {group.map(seatNum => {
                    const displayKey = `${row.name}${seatNum}`
                    const seatData = statusMap[displayKey]
                    const sel = isSelected(displayKey)
                    const cls = seatClass(seatData, sel, noApiData)
                    const clickable = cls === 'seat available' || cls === 'seat selected'

                    return (
                      <div
                        key={seatNum}
                        className={cls}
                        title={`${row.name}${seatNum}`}
                        style={{ cursor: clickable ? 'pointer' : 'default' }}
                        onClick={() => handleClick(row.name, seatNum, seatData, displayKey, cls)}
                      >
                        {seatNum}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            {/* Label droit */}
            <span className="row-label">{row.name}</span>
          </div>
        ))}
      </div>

      {/* ── Légende + compteur ── */}
      <div className="seatmap-footer">
        <div className="legend">
          <div className="legend-item"><div className="seat available" /><span>Libre</span></div>
          <div className="legend-item"><div className="seat selected" /><span>Sélectionné</span></div>
          <div className="legend-item"><div className="seat taken" /><span>Pris</span></div>
          <div className="legend-item"><div className="seat house" /><span>Réservé</span></div>
          <div className="legend-item"><div className="seat broken" /><span>Indispo</span></div>
        </div>
        {!noApiData && (
          <div className="seat-counter">
            <span className="counter-free">{totalFree}</span>
            <span className="counter-label"> place{totalFree > 1 ? 's' : ''} libre{totalFree > 1 ? 's' : ''}</span>
            <span className="counter-sep"> / </span>
            <span className="counter-total">{layout.totalSeats}</span>
          </div>
        )}
      </div>
    </div>
  )
}
