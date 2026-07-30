import BookingFlow from '../../../../BookingFlow'

// Étape 3 — plan de salle d'une séance.
export default async function Page({ params }) {
  const { film, session } = await params
  return <BookingFlow initialRoute={{ step: 'seats', filmParam: film, sessionId: session }} />
}
