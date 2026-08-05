/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['192.168.1.74'],

  async redirects() {
    return [
      // /termes-et-conditions recopiait mot pour mot le texte de cinepax.mg,
      // y compris sa clause de droit applicable — « les lois du gouvernement
      // du Pakistan » — pour un cinéma d'Antananarivo. Ce texte est repris,
      // corrigé et scindé en CGU et CGV dans /legal, où l'administration peut
      // l'amender. Garder deux pages de conditions concurrentes ferait douter
      // de celle qui fait foi.
      //
      // Redirection temporaire : l'ancien texte reste dans lib/contenu.js
      // (constante TERMES) si le client veut le rétablir.
      { source: '/termes-et-conditions', destination: '/legal', permanent: false },

      // Adresses courantes que les visiteurs tapent à la main
      { source: '/cgu',  destination: '/legal/cgu',  permanent: false },
      { source: '/cgv',  destination: '/legal/cgv',  permanent: false },
      { source: '/rgpd', destination: '/legal/rgpd', permanent: false },
      { source: '/confidentialite', destination: '/legal/pdd', permanent: false },
      { source: '/mentions-legales', destination: '/legal', permanent: false },
    ]
  },
}

export default nextConfig
