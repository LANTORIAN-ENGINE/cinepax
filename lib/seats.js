// Ordre de lecture du plan : rangée puis numéro.
//
// Les places choisies sont relevées à deux endroits de l'étape sièges — le
// bandeau sous l'écran et la barre de confirmation en bas de page. Les deux
// listent la même chose, donc les deux se lisent dans l'ordre où l'on regarde
// la salle, jamais dans l'ordre où l'on a cliqué.
export function sortByPlanOrder(seats) {
  return [...seats].sort((a, b) => {
    if (a.rowName !== b.rowName) return a.rowName.localeCompare(b.rowName)
    return parseInt(a.seatNumber, 10) - parseInt(b.seatNumber, 10)
  })
}
