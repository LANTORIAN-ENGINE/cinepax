'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import NavAuth from './NavAuth'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useI18n } from '@/lib/i18n'

// Rubriques principales, puis celles regroupées sous « Plus » — la barre ne
// tient pas les sept d'un seul tenant.
const PRIMARY = [
  { href: '/',              key: 'nav.now' },
  { href: '/prochainement', key: 'nav.soon' },
  { href: '/programme',     key: 'nav.programme' },
  { href: '/nos-offres',    key: 'nav.offers' },
]

const SECONDARY = [
  { href: '/a-propos',             key: 'nav.about' },
  { href: '/contact',              key: 'nav.contact' },
  { href: '/termes-et-conditions', key: 'nav.terms' },
]

export function Navbar() {
  const { t } = useI18n()
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef(null)

  // Referme « Plus » au changement de page et sur clic extérieur / Échap.
  useEffect(() => { setMoreOpen(false) }, [pathname])

  useEffect(() => {
    if (!moreOpen) return
    function onDown(e) { if (!moreRef.current?.contains(e.target)) setMoreOpen(false) }
    function onKey(e) { if (e.key === 'Escape') setMoreOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [moreOpen])

  const inMore = SECONDARY.some(l => l.href === pathname)

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link href="/" className="navbar-logo">
          <img src="/logo.jpg" alt="Cinepax Madagascar" />
        </Link>
        <div className="navbar-right">
          <div className="navbar-links">
            <div className="navbar-sections">
              {PRIMARY.map(link => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`nav-link ${pathname === link.href ? 'active' : ''}`}
                >
                  {t(link.key)}
                </Link>
              ))}

              <div className="nav-more" ref={moreRef}>
                <button
                  type="button"
                  className={`nav-link nav-more-btn ${inMore ? 'active' : ''}`}
                  onClick={() => setMoreOpen(o => !o)}
                  aria-expanded={moreOpen}
                  aria-haspopup="true"
                >
                  {t('nav.more')}
                  <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11" className={`chevron ${moreOpen ? 'up' : ''}`}>
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>

                {moreOpen && (
                  <div className="nav-more-menu">
                    {SECONDARY.map(link => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={`nav-more-item ${pathname === link.href ? 'active' : ''}`}
                      >
                        {t(link.key)}
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Sur mobile la rangée défile horizontalement : un menu déroulant
                  y serait rogné, donc les rubriques secondaires s'affichent
                  en ligne. Masqué au-delà, où « Plus » les regroupe. */}
              <div className="navbar-sections-inline">
                {SECONDARY.map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`nav-link ${pathname === link.href ? 'active' : ''}`}
                  >
                    {t(link.key)}
                  </Link>
                ))}
              </div>
            </div>
          </div>
          {/* Compte et langue forment le groupe d'utilitaires, calé à droite :
              même hauteur, même pastille, séparés de la navigation. */}
          <NavAuth />
          <LanguageSwitcher />
        </div>
      </div>
    </nav>
  )
}

export function Footer() {
  const { t } = useI18n()
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-left">
          <img src="/logo.jpg" alt="Cinepax Madagascar" className="footer-logo" />
          <p className="footer-address">
            CINEPAX MADAGASCAR | Tana Water Front, Antananarivo, Madagascar | Phone (+261) 34 05 735 01
          </p>
          <div className="footer-social">
            <a href="#" className="social-link" aria-label="Facebook">
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </a>
            <a href="#" className="social-link" aria-label="Instagram">
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
            </a>
          </div>
        </div>

        <div className="footer-links">
          <div className="footer-col">
            <Link href="/">{t('footer.colNow')}</Link>
            <Link href="/termes-et-conditions">{t('footer.colTerms')}</Link>
            <Link href="/programme">{t('footer.colSchedule')}</Link>
            <Link href="/nos-offres">{t('footer.colOffers')}</Link>
          </div>
          <div className="footer-col">
            <Link href="/prochainement">{t('footer.colSoon')}</Link>
            <Link href="/a-propos">{t('footer.colAbout')}</Link>
            <Link href="/contact">{t('footer.colContact')}</Link>
          </div>
        </div>
      </div>

      <div className="footer-bottom">
        <p>Website platform (C) <a href="#">Flicks</a> Limited 2026</p>
        <p className="footer-poc">Proof of Concept - eTech</p>
      </div>
    </footer>
  )
}
