// Les pages légales sont rendues côté client — le texte vient de la base et
// suit la langue choisie. Ce calque serveur n'existe que pour porter les
// métadonnées : un contrat doit être trouvable et citable, donc indexable.

export const metadata = {
  title: 'Informations légales — Cinepax Madagascar',
  description:
    'Conditions générales d’utilisation et de vente, mention RGPD et politique de protection des données de Cinepax Madagascar.',
}

export default function LegalLayout({ children }) {
  return children
}
