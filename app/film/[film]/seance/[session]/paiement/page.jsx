import BookingFlow from '../../../../../BookingFlow'

// Étape 4 — paiement. Ouverte à froid (lien collé, F5), cette adresse retombe
// sur le plan de salle : les places choisies ne sont pas dans l'URL et un
// paiement ne se rejoue pas sans elles.
export default async function Page({ params }) {
  const { film, session } = await params
  return <BookingFlow initialRoute={{ step: 'payment', filmParam: film, sessionId: session }} />
}
