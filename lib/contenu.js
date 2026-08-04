// Contenus rédactionnels repris de cinepax.mg.
//
// Ces pages n'existent dans aucune API : ni Veezi (/v1, /v4) ni Connect
// n'exposent d'endpoint éditorial — sondés sans succès. Les textes et visuels
// vivent dans le CMS Vista/Flicks du site actuel (cdn.vwassets.com), auquel
// nous n'avons pas accès. Ils sont donc recopiés ici et versionnés avec le
// code, plutôt que chargés depuis cinepax.mg à l'exécution.
//
// Ce qui vient bien de l'API est ailleurs :
//   • adresse, téléphone, salles → /api/site        (Veezi /v1/site + /v1/screen)
//   • programme de la semaine    → /api/programme   (Veezi /v1/session + /v4/film)
//   • grilles tarifaires         → PriceCardName des séances + price_cards

export const APROPOS = {
  paragraphs: [
    "Cinepax Madagascar fait partie du groupe Talys, et participe au mouvement de renouveau du cinéma dans les pays africains francophones, en leur ouvrant leur portes de la scène internationale.",
    "Aujourd’hui, à Antananarivo, Cinepax répond aux attentes des Malagasy en mettant à leur disposition des infrastructures aux normes internationales, et en proposant 4 salles, en 2D et 3D, avec une qualité sonore Dolby Surround 7.1.",
    "Nous mettons un point d’honneur au confort, ainsi qu’à la qualité audiovisuelle pour améliorer votre expérience. Nous apportons le plaisir des salles obscures à votre porte, en vous offrant un programme aussi diversifié que le sont les genres cinématographiques.",
    "Appréciez l’expérience du 7e art, de la gourmandise du popcorn à l’extase du visionnage des derniers blockbusters chez Cinepax, au centre commercial Tana Water Front.",
    "À bientôt dans nos salles !",
  ],
  photos: [
    { src: '/content/apropos-salle-1.jpg', alt: 'Salle Cinepax Madagascar' },
    { src: '/content/apropos-salle-2.jpg', alt: 'Salle Cinepax Madagascar' },
  ],
}

// Horaires et e-mail : absents de Veezi, relevés sur cinepax.mg.
export const CONTACT = {
  legalName: 'Cinepax Madagascar',
  addressDisplay: 'Tana Water Front, Antananarivo, Madagascar',
  email: 'contact@cinepax.mg',
  phoneDisplay: '+261 34 05 735 01',
  whatsapp: '+261 34 05 735 08',
  salesEmail: 'sales.marketing@cinepax.mg',
  mapQuery: 'Cinepax Madagascar, Tana Water Front Antananarivo, Madagascar',
  hours: [
    { day: 'Lundi',              value: 'Fermeture hebdomadaire', closed: true },
    { day: 'Mardi',              value: '17h00 à 23h00' },
    { day: 'Mercredi',           value: '11h30 à 20h00' },
    { day: 'Jeudi et vendredi',  value: '13h30 à 23h00' },
    { day: 'Samedi et dimanche', value: '9h30 à 23h00' },
  ],
  socials: [
    { label: 'Facebook', href: 'https://www.facebook.com/cinepaxmadagascar' },
    { label: 'Instagram', href: 'https://www.instagram.com/cinepaxmadagascar' },
  ],
}

// Le même repère que le plan de la page Contact, mais en navigation plein
// écran : c'est la seule forme qui ouvre l'application Maps d'un téléphone.
export const MAPS_URL =
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(CONTACT.mapQuery)}`

// Un lien tel: n'accepte ni espace ni parenthèse ; le « + » de l'indicatif
// international, lui, est significatif et doit rester.
export const TEL_HREF = `tel:${CONTACT.phoneDisplay.replace(/[^\d+]/g, '')}`

// Visuels promotionnels : créations graphiques sans équivalent structuré dans
// l'API. Les montants qu'affiche l'affiche des tarifs sont, eux, modélisés
// dans price_cards — voir supabase/seed_price_cards.sql.
export const OFFRES = {
  tarifsPoster: '/content/offres-tarifs.jpg',
  cards: [
    {
      src: '/content/offres-cinekadwa.jpg',
      title: 'CineKadwa — bon cadeau',
      text: 'Bons cadeaux de 100 000 Ar et 200 000 Ar, à utiliser en caisse ou à la confiserie.',
    },
    {
      src: '/content/offres-anniversaire.jpg',
      title: 'Ton anniversaire au cinéma',
      text: 'Renseignements et réservations sur place ou au 034 05 735 01.',
      contact: 'sales.marketing@cinepax.mg',
    },
    {
      src: '/content/offres-evenements.jpg',
      title: 'Le lieu pour vos événements',
      text: '4 salles et 1 rooftop privatisables.',
      contact: 'sales.marketing@cinepax.mg',
    },
    {
      src: '/content/offres-publicite.jpg',
      title: 'Votre publicité avant les films',
      text: 'Diffusion de votre spot publicitaire avant les séances.',
      contact: 'contact@cinepax.mg',
    },
  ],
}

// Recopiés mot pour mot depuis cinepax.mg/termes-et-conditions.
export const TERMES = [
  {
    heading: "CONDITIONS GÉNÉRALES D'ACHAT DE TICKETS EN LIGNE",
    paragraphs: [
      "Ce site Web est géré par nous: Cinepax Limited Lorsque vous utilisez ce site Web, vous devez vous conformer à ces termes et conditions d'utilisation. Nous pouvons modifier ces termes et conditions de temps en temps, veuillez les lire chaque fois que vous utilisez le site Web pour vous assurer que vous êtes tenu au courant. En poursuivant votre navigation sur ce site, vous acceptez les conditions générales d'utilisation en vigueur. Si vous n'êtes pas d'accord avec ces termes et conditions, vous ne devez pas utiliser le site Web.",
    ],
  },
  {
    heading: "Joindre",
    paragraphs: [
      "Lorsque vous vous inscrivez, nous vous demanderons des détails sur vous-même. De temps en temps nous pourrions demander des informations supplémentaires pour les compétitions et ainsi de suite. Votre vie privée est très importante pour nous et nous ne transmettrons aucune information à votre sujet à des tiers à moins que vous nous ayez donné votre autorisation écrite pour le faire.",
    ],
  },
  {
    heading: "Propriété intellectuelle",
    paragraphs: [
      "Ce que nous vous permettons de faire / ne pas faire Nous possédons tout le matériel sur ce site. Cela inclut tous les textes, dessins, logos, graphiques, programmes informatiques, audio, vidéo et code (y compris HTML) sous quelque forme que ce soit. Sauf indication contraire dans les présentes conditions d'utilisation, aucun des éléments de ce site Web ne peut être reproduit, téléchargé, distribué, copié, republié, affiché ou transmis sous quelque forme que ce soit sans notre autorisation écrite. Nous vous accordons la permission d'afficher ce site Web avec un navigateur Web à condition de ne pas: Modifier le contenu de ce site Web; Revendez le matériel sur ce site Web; ou Créer des œuvres dérivées à partir du matériel sur ce site Web. Nous pouvons retirer cette permission à tout moment sans préavis. Vous ne pouvez pas utiliser, encadrer ou utiliser des techniques de cadrage pour inclure du matériel sur ce site Web sans notre consentement écrit. De plus, vous ne pouvez pas utiliser de «méta-tags» ou d'autres «textes cachés» qui utilisent notre nom ou notre marque de commerce ou notre nom de produit sans notre consentement écrit. Ce que vous nous autorisez à faire / ne pas faire avec vos soumissions Nous pouvons, à notre entière discrétion, publier sur ce site web les informations que vous nous soumettez pour: Participation à des compétitions Revue personnelle de film Autre raison En nous soumettant des informations ou du matériel vous nous accordez une licence mondiale irrévocable, perpétuelle, libre de droits, non exclusive et exclusive pour: Utiliser, reproduire, modifier, sous-licencier, redistribuer, adapter, transmettre, publier, diffuser et afficher cette information ou matériel et en créer des œuvres dérivées ; Sous-licence l'un des droits de renonciation à des tiers.",
    ],
  },
  {
    heading: "Mise en relation",
    paragraphs: [
      "Vous ne devez pas créer de lien hypertexte vers ce site Web, à moins que nous ne vous ayons donné notre autorisation expresse par écrit.",
    ],
  },
  {
    heading: "Conduite",
    paragraphs: [
      "En utilisant ce site Web, vous ne devez pas: perturber le fonctionnement ou la sécurité de ce site Web ou de tout compte, serveur ou réseau connecté ou accessible par le biais de ce site Web; Utilisez ce site Web d'une manière qui puisse harceler, déranger ou perturber toute personne tierce, y compris une tierce personne qui pourrait recevoir des messages suite à votre utilisation de ce site Web; Soumettre toute information ou matériel de nature illégale, menaçante, abusive, diffamatoire, obscène, vulgaire, pornographique, profane ou indécente, y compris, sans limitation, tout élément constituant ou encourageant une conduite qui constituerait une infraction pénale, engagerait sa responsabilité civile ou violerait autrement toute loi applicable; soumettre tout matériel de toute nature qui viole ou enfreint les droits de toute autre personne, y compris le matériel qui constitue une atteinte à tout droit à la vie privée, protégé par copyright, marque ou tout autre droit de propriété sans l'autorisation préalable du propriétaire ou titulaire du droit pertinent; Soumettre tout matériel de toute nature qui contient un virus ou un autre composant nuisible; Supprimer toute attribution d'auteur, mentions légales ou désignations ou labels exclusifs dans tout document soumis; Modifier ou supprimer tout contenu sur ce site Web ou ajouter du contenu à ce site Web; ou Tenter d'accéder sans autorisation à une partie de ce site Web. Nous nous réservons le droit de coopérer pleinement avec toute autorité chargée de l'application de la loi dans toute juridiction en ce qui concerne toute directive légale ou demande de divulgation de l'identité ou d'autres informations concernant toute personne qui publie tout matériel violant toute loi applicable ou pertinente.",
    ],
  },
  {
    heading: "Sécurité et exactitude de l'information",
    paragraphs: [
      "Ce site Web peut varier de temps en temps.",
    ],
  },
  {
    heading: "Sites tiers",
    paragraphs: [
      "Vous pouvez peut-être accéder à des sites tiers à partir de ce site Web. Nous ne faisons aucune représentation ou revendication concernant le contenu, la qualité ou la fiabilité de ces sites, et l'inclusion d'un lien vers eux n'implique pas que nous ayons une relation ou une affiliation avec eux.",
    ],
  },
  {
    heading: "Mot de passe",
    paragraphs: [
      "Si vous vous enregistrez sur ce site Web, vous pouvez recevoir un mot de passe. Si vous avez un mot de passe, vous devez le garder secret et sécurisé.",
    ],
  },
  {
    heading: "Général",
    paragraphs: [
      "Obligation de diligence en common law. Nous n'assumons aucun devoir de diligence de droit commun envers vous en fournissant l'information sur ce site Web.",
    ],
  },
  {
    heading: "Des disputes",
    paragraphs: [
      "Tout différend entre vous et nous sera déterminé selon les lois du gouvernement du Pakistan.",
    ],
  },
]
