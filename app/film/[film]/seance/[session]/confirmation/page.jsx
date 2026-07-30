import BookingFlow from '../../../../../BookingFlow'

// Étape 5 — confirmation. Comme le paiement, cette adresse n'est reconstituable
// qu'avec la réservation en mémoire ; sinon elle retombe sur le plan de salle.
// Le billet reste consultable depuis /mon-compte et /payment/success?ref=…
export default async function Page({ params }) {
  const { film, session } = await params
  return <BookingFlow initialRoute={{ step: 'done', filmParam: film, sessionId: session }} />
}
