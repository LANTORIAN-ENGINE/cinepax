import './globals.css'
import { LanguageProvider } from '@/lib/i18n'
import { Navbar, Footer } from './SiteChrome'
import RgpdBanner from '@/components/RgpdBanner'

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
    <html lang="fr">
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
