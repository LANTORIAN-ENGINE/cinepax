import './globals.css'
import { LanguageProvider } from '@/lib/i18n'
import { Navbar, Footer } from './SiteChrome'

export const metadata = {
  title: 'Cinepax Madagascar',
  description: 'Réservation de billets en ligne',
  icons: {
    icon: '/logo.jpg',
    apple: '/logo.jpg',
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
        </LanguageProvider>
      </body>
    </html>
  )
}
