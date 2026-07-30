// Icônes de la barre de navigation.
//
// Elles ne rejoignent pas le jeu des espaces client et admin, pour deux
// raisons. À 14 px, un trait de 1,6 sur une grille de 24 tombe sous le pixel
// et s'efface : il faut le remonter. Et chaque glyphe porte ici une pièce
// nommée que la feuille de style met en mouvement au survol, ce qui n'aurait
// aucun sens dans un jeu d'icônes statiques.
//
// Un principe tient l'ensemble : le glyphe est complet au repos. Le survol
// ajoute un geste, jamais une pièce manquante — un pictogramme qui ne se
// termine qu'au survol ne se lit pas au repos, là où on le regarde vraiment.
//
// Les gestes sont dans app/globals.css, section ICÔNES DE NAVIGATION.

const BASE = {
  viewBox: '0 0 24 24',
  width: 14,
  height: 14,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: 'false',
}

// Actuellement : ce qui passe en ce moment. Le triangle avance au survol,
// comme on lance la séance.
export const NavIconNow = () => (
  <svg {...BASE} className="nav-icon ni-now">
    <circle cx="12" cy="12" r="8.4" />
    <path className="ni-now-play" d="M10.2 8.9l5.4 3.1-5.4 3.1z" fill="currentColor" stroke="none" />
  </svg>
)

// Prochainement : le sablier, seul objet qui dise « bientôt » sans chiffre.
// Il se retourne au survol — le geste est le sens.
export const NavIconSoon = () => (
  <svg {...BASE} className="nav-icon ni-soon">
    <path d="M6.8 4.2h10.4M6.8 19.8h10.4" />
    <path d="M8.4 4.2v2.9L12 12l-3.6 4.9v2.9" />
    <path d="M15.6 4.2v2.9L12 12l3.6 4.9v2.9" />
  </svg>
)

// Programme : la grille des jours. La case retenue glisse d'un cran, ce que
// fait exactement le visiteur qui cherche sa date.
//
// Les deux pattes de suspension ne sont pas décoratives : sans elles, le
// cadre à bandeau se lit comme une carte bancaire.
export const NavIconSchedule = () => (
  <svg {...BASE} className="nav-icon ni-schedule">
    <rect x="3.8" y="5.2" width="16.4" height="15" rx="2" />
    <path d="M3.8 9.8h16.4" />
    <path d="M8.4 3.4v3.3M15.6 3.4v3.3" />
    <rect className="ni-schedule-day" x="6.9" y="12.6" width="3.6" height="3.6" rx="0.9"
      fill="currentColor" stroke="none" />
  </svg>
)

// Nos offres : l'étiquette de prix. Elle s'incline sur son œillet, comme
// pendue à son fil — d'où le groupe, qui donne au pivot un repère propre.
export const NavIconOffers = () => (
  <svg {...BASE} className="nav-icon ni-offers">
    <g className="ni-offers-tag">
      <path d="M4.7 3.4h7.2a1.7 1.7 0 011.2.5l7 7a1.7 1.7 0 010 2.4l-7.2 7.2a1.7 1.7 0 01-2.4 0l-7-7a1.7 1.7 0 01-.5-1.2V5.1a1.7 1.7 0 011.7-1.7z" />
      <circle cx="7.6" cy="7.6" r="1.5" />
    </g>
  </svg>
)

// À propos : le disque d'information. Aucun mouvement ne lui est propre —
// il se soulève, et c'est tout. Forcer un geste ici ferait le tour de passe-
// passe que les autres évitent justement.
export const NavIconAbout = () => (
  <svg {...BASE} className="nav-icon ni-about">
    <circle cx="12" cy="12" r="8.4" />
    <path d="M12 11.4v4.6" />
    <path d="M12 8.1v.1" />
  </svg>
)

// Contact : l'enveloppe, dont le rabat s'ouvre au survol.
export const NavIconContact = () => (
  <svg {...BASE} className="nav-icon ni-contact">
    <rect x="3.2" y="5.4" width="17.6" height="13.2" rx="2.2" />
    <path className="ni-contact-flap" d="M3.9 7l7.1 5.1a1.7 1.7 0 002 0L20.1 7" />
  </svg>
)

// Termes : la page à coin replié. Les lignes défilent, comme on parcourt
// des conditions plutôt qu'on ne les lit.
export const NavIconTerms = () => (
  <svg {...BASE} className="nav-icon ni-terms">
    <path d="M13.4 3.4H6.6A1.6 1.6 0 005 5v14a1.6 1.6 0 001.6 1.6h10.8A1.6 1.6 0 0019 19V9z" />
    <path d="M13.4 3.4V9H19" />
    <path className="ni-terms-lines" d="M8.2 13h7.6M8.2 16.4h5.2" />
  </svg>
)
