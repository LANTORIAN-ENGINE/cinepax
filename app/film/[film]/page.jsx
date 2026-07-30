import BookingFlow from '../../BookingFlow'

// Étape 2 — détail du film et ses séances.
// Cette route n'existe que pour servir les liens partagés et les
// rechargements : en navigation normale, le tunnel écrit lui-même cette URL
// sans repasser par le serveur.
export default async function Page({ params }) {
  const { film } = await params
  return <BookingFlow initialRoute={{ step: 'sessions', filmParam: film }} />
}
