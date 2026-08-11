import './globals.css'
import { Bebas_Neue, DM_Sans } from 'next/font/google'
import { LanguageProvider } from '@/lib/i18n'
import { Navbar, Footer } from './SiteChrome'
import RgpdBanner from '@/components/RgpdBanner'

// Les deux polices sont servies depuis le domaine du site, pas depuis Google.
// L'@import qui les appelait dans globals.css ne survivait pas au bundle
// Turbopack : le site tournait en Arial partout où il demandait Bebas Neue.
const bebas = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-display',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
})

export const metadata = {
  title: 'Cinepax Madagascar — Achat de tickets en ligne',
  description: 'Achat de tickets de cinéma en ligne : choisissez votre séance et vos sièges, payez, et recevez votre billet. Achat ferme et définitif.',
  icons: {
    icon: '/logo2.png',
    apple: '/logo2.png',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="fr" className={`${bebas.variable} ${dmSans.variable}`}>
      <body>
        <LanguageProvider>
          <Navbar />
          <main className="main-content">
            {children}
          </main>
          <Footer />
          <RgpdBanner />
        </LanguageProvider>
      </body>
    </html>
  )
}
