import BookingFlow from './BookingFlow'

// Accueil — films à l'affiche. Les étapes suivantes du tunnel vivent sous
// /film/… (voir app/film/[film]/…) mais partagent ce même composant : la
// navigation entre étapes se fait sans rechargement, par l'API History.
export default function Page() {
  return <BookingFlow initialRoute={{ step: 'films' }} />
}
