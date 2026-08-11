// Jeu d'icônes des espaces client et administration.
//
// Tracé plutôt que plein : à 20 px sur fond sombre, un contour de 1,6 px reste
// lisible là où un glyphe plein s'empâte. Toutes les icônes partagent la même
// grille 24, le même trait et les mêmes extrémités arrondies — c'est ce qui
// les fait lire comme un ensemble plutôt que comme une collection.

function Icon({ size = 20, children, ...rest }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

/* ── Navigation ─────────────────────────────────────────────── */

// Tableau de bord : un cadran, pas quatre carrés — on y lit une mesure.
export const IconGauge = p => (
  <Icon {...p}>
    <path d="M12 14a2 2 0 100-4 2 2 0 000 4z" />
    <path d="M13.4 10.6L17 7" />
    <path d="M4.2 17a9 9 0 1115.6 0" />
  </Icon>
)

// Réservations : un billet avec sa perforation — l'ancienne icône se lisait
// comme une calculatrice.
export const IconTicket = p => (
  <Icon {...p}>
    <path d="M3 9.5V7a1 1 0 011-1h16a1 1 0 011 1v2.5a2.5 2.5 0 000 5V17a1 1 0 01-1 1H4a1 1 0 01-1-1v-2.5a2.5 2.5 0 000-5z" />
    <path d="M14 6v2M14 11v2M14 16v2" strokeDasharray="0.1 3" />
  </Icon>
)

export const IconUsers = p => (
  <Icon {...p}>
    <path d="M15.5 20v-1.7a3.3 3.3 0 00-3.3-3.3H6.3A3.3 3.3 0 003 18.3V20" />
    <circle cx="9.25" cy="8" r="3.2" />
    <path d="M21 20v-1.7a3.3 3.3 0 00-2.5-3.2" />
    <path d="M15.5 5a3.3 3.3 0 010 6.2" />
  </Icon>
)

// Compte : buste seul, épaules coupées par le cadre — à 15 px dans la pastille
// de la barre, un buste détouré se lit mieux qu'une silhouette entière.
export const IconUser = p => (
  <Icon {...p}>
    <circle cx="12" cy="8.4" r="3.6" />
    <path d="M5.4 20.2a6.6 6.6 0 0113.2 0" />
  </Icon>
)

export const IconTag = p => (
  <Icon {...p}>
    <path d="M20.6 12.9l-7.7 7.7a1.6 1.6 0 01-2.3 0l-7.2-7.2a1.6 1.6 0 01-.4-1.1V4.8c0-.9.7-1.6 1.6-1.6h7.5c.4 0 .8.2 1.1.4l7.4 7.4a1.6 1.6 0 010 1.9z" />
    <circle cx="7.6" cy="7.6" r="1.3" />
  </Icon>
)

export const IconHome = p => (
  <Icon {...p}>
    <path d="M3.5 10.5L12 3.5l8.5 7" />
    <path d="M5.5 9.6V19a1 1 0 001 1h11a1 1 0 001-1V9.6" />
    <path d="M9.8 20v-5.2h4.4V20" />
  </Icon>
)

export const IconLogOut = p => (
  <Icon {...p}>
    <path d="M14 20H6a1 1 0 01-1-1V5a1 1 0 011-1h8" />
    <path d="M17.5 15.5L21 12l-3.5-3.5" />
    <path d="M21 12H10" />
  </Icon>
)

export const IconMenu = p => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h10" />
  </Icon>
)

/* ── Actions ────────────────────────────────────────────────── */

export const IconSearch = p => (
  <Icon {...p}>
    <circle cx="10.8" cy="10.8" r="6.3" />
    <path d="M15.5 15.5L20 20" />
  </Icon>
)

export const IconDownload = p => (
  <Icon {...p}>
    <path d="M12 3.8v10.4" />
    <path d="M8.2 10.6L12 14.4l3.8-3.8" />
    <path d="M4.5 17.2v1.6a1.4 1.4 0 001.4 1.4h12.2a1.4 1.4 0 001.4-1.4v-1.6" />
  </Icon>
)

export const IconScan = p => (
  <Icon {...p}>
    <path d="M4 8.5V5.6A1.6 1.6 0 015.6 4h2.9" />
    <path d="M15.5 4h2.9A1.6 1.6 0 0120 5.6v2.9" />
    <path d="M20 15.5v2.9a1.6 1.6 0 01-1.6 1.6h-2.9" />
    <path d="M8.5 20H5.6A1.6 1.6 0 014 18.4v-2.9" />
    <path d="M4 12h16" />
  </Icon>
)

export const IconQr = p => (
  <Icon {...p}>
    <rect x="3.8" y="3.8" width="6.4" height="6.4" rx="1.2" />
    <rect x="13.8" y="3.8" width="6.4" height="6.4" rx="1.2" />
    <rect x="3.8" y="13.8" width="6.4" height="6.4" rx="1.2" />
    <path d="M14 14h2.2v2.2H14zM18 18h2.2v2.2H18zM14 18.5v1.7M20.2 14v2" />
  </Icon>
)

export const IconClose = p => (
  <Icon {...p}>
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </Icon>
)

export const IconCheck = p => (
  <Icon {...p}>
    <path d="M4.8 12.6l4.6 4.6L19.2 7.4" />
  </Icon>
)

export const IconTrash = p => (
  <Icon {...p}>
    <path d="M4.5 6.8h15" />
    <path d="M9.3 6.8V5.2a1.2 1.2 0 011.2-1.2h3a1.2 1.2 0 011.2 1.2v1.6" />
    <path d="M6.4 6.8l.8 12a1.2 1.2 0 001.2 1.1h7.2a1.2 1.2 0 001.2-1.1l.8-12" />
    <path d="M10.4 10.5v5.6M13.6 10.5v5.6" />
  </Icon>
)

export const IconPlus = p => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

// Loupe de IconSearch, signe en plus : les trois icônes de zoom partagent
// exactement le même cercle et la même queue, seul le glyphe intérieur change.
// Posées côte à côte dans la barre de la visionneuse, elles ne bougent pas.
export const IconZoomIn = p => (
  <Icon {...p}>
    <circle cx="10.8" cy="10.8" r="6.3" />
    <path d="M15.5 15.5L20 20" />
    <path d="M10.8 8.2v5.2M8.2 10.8h5.2" />
  </Icon>
)

export const IconZoomOut = p => (
  <Icon {...p}>
    <circle cx="10.8" cy="10.8" r="6.3" />
    <path d="M15.5 15.5L20 20" />
    <path d="M8.2 10.8h5.2" />
  </Icon>
)

// Agrandir : quatre coins qui s'écartent. Le geste est celui de l'affiche
// qu'on tire aux angles, pas celui d'une loupe qu'on approche.
export const IconExpand = p => (
  <Icon {...p}>
    <path d="M9.4 4.4H5.6a1.2 1.2 0 00-1.2 1.2v3.8" />
    <path d="M14.6 4.4h3.8a1.2 1.2 0 011.2 1.2v3.8" />
    <path d="M19.6 14.6v3.8a1.2 1.2 0 01-1.2 1.2h-3.8" />
    <path d="M4.4 14.6v3.8a1.2 1.2 0 001.2 1.2h3.8" />
  </Icon>
)

/* ── Données ────────────────────────────────────────────────── */

export const IconCalendar = p => (
  <Icon {...p}>
    <rect x="3.8" y="5.2" width="16.4" height="15" rx="1.8" />
    <path d="M3.8 9.6h16.4" />
    <path d="M8.4 3.5v3.4M15.6 3.5v3.4" />
  </Icon>
)

// Réglages : trois curseurs, chacun sur sa course — on y lit qu'il y a
// quelque chose à doser, là où une roue dentée ne dit que « technique ».
export const IconSliders = p => (
  <Icon {...p}>
    <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h9M17 17h3" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="15" cy="17" r="2" />
  </Icon>
)

export const IconClock = p => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.2" />
    <path d="M12 7.4V12l3 1.8" />
  </Icon>
)

export const IconSeat = p => (
  <Icon {...p}>
    <path d="M6.5 11V6.4a2 2 0 012-2h7a2 2 0 012 2V11" />
    <path d="M4.6 11.2a1.8 1.8 0 013.6 0v3.2h7.6v-3.2a1.8 1.8 0 013.6 0v5.1a1.8 1.8 0 01-1.8 1.8H6.4a1.8 1.8 0 01-1.8-1.8z" />
    <path d="M7.4 18.1v1.8M16.6 18.1v1.8" />
  </Icon>
)

export const IconCoin = p => (
  <Icon {...p}>
    <ellipse cx="12" cy="7" rx="7.2" ry="3.2" />
    <path d="M4.8 7v10c0 1.8 3.2 3.2 7.2 3.2s7.2-1.4 7.2-3.2V7" />
    <path d="M4.8 12c0 1.8 3.2 3.2 7.2 3.2s7.2-1.4 7.2-3.2" />
  </Icon>
)

export const IconShield = p => (
  <Icon {...p}>
    <path d="M12 3.6l7 2.6v5.3c0 4.1-2.8 7.6-7 8.9-4.2-1.3-7-4.8-7-8.9V6.2z" />
    <path d="M9.2 12l2 2 3.6-3.7" />
  </Icon>
)

export const IconMail = p => (
  <Icon {...p}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="1.8" />
    <path d="M4 7l7.1 5a1.6 1.6 0 001.8 0L20 7" />
  </Icon>
)

// Adresse : la goutte du repère cartographique, pointe comprise — c'est la
// pointe qui dit « ici », et non le disque, qu'on lirait comme un bouton.
export const IconMapPin = p => (
  <Icon {...p}>
    <path d="M12 21.2c4.3-4.4 6.5-7.7 6.5-10.4a6.5 6.5 0 10-13 0c0 2.7 2.2 6 6.5 10.4z" />
    <circle cx="12" cy="10.6" r="2.4" />
  </Icon>
)

// Téléphone : le combiné plutôt que le mobile. Un rectangle à écran se lit
// comme un appareil ; le combiné se lit comme l'action d'appeler.
export const IconPhone = p => (
  <Icon {...p}>
    <path d="M6.4 3.6h3.1l1.5 3.9-2 1.3a11.6 11.6 0 005.2 5.2l1.3-2 3.9 1.5v3.1a1.8 1.8 0 01-2 1.8A16.4 16.4 0 014.6 5.6a1.8 1.8 0 011.8-2z" />
  </Icon>
)

export const IconAlert = p => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.2" />
    <path d="M12 7.8v4.6M12 15.8v.1" />
  </Icon>
)

export const IconArrowRight = p => (
  <Icon {...p}>
    <path d="M4.8 12h14.4M14 6.8l5.2 5.2-5.2 5.2" />
  </Icon>
)

// Cadenas fermé : l'état d'une case de consentement tant que le document
// n'a pas été lu. Il remplace la coche, il ne s'ajoute pas à elle.
export const IconLock = p => (
  <Icon {...p}>
    <rect x="4.8" y="10.4" width="14.4" height="9.2" rx="2" />
    <path d="M8.4 10.4V7.8a3.6 3.6 0 017.2 0v2.6" />
  </Icon>
)

// Document légal : la page cornée, repère commun au pied de page, au
// sommaire et à la rubrique d'administration.
export const IconDoc = p => (
  <Icon {...p}>
    <path d="M13.4 3.4H7a1.8 1.8 0 00-1.8 1.8v13.6A1.8 1.8 0 007 20.6h10a1.8 1.8 0 001.8-1.8V8.8z" />
    <path d="M13.4 3.4v5.4h5.4M8.8 13h6.4M8.8 16.4h4.2" />
  </Icon>
)

export const IconPrinter = p => (
  <Icon {...p}>
    <path d="M7 9.4V4.2h10v5.2" />
    <rect x="4.2" y="9.4" width="15.6" height="6.4" rx="1.8" />
    <path d="M7 14.2h10v5.6H7z" />
  </Icon>
)

export default Icon
