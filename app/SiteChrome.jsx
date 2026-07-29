'use client'
import Link from 'next/link'
import NavAuth from './NavAuth'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useI18n } from '@/lib/i18n'

export function Navbar() {
  const { t } = useI18n()
  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link href="/" className="navbar-logo">
          <img src="/logo.jpg" alt="Cinepax Madagascar" />
        </Link>
        <div className="navbar-right">
          <div className="navbar-links">
            <a href="/" className="nav-link active">
              <svg className="nav-icon" viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
              </svg>
              {t('nav.now')}
            </a>
            <NavAuth />
            <div className="poc-badge">
              <span className="poc-dot" />
              POC — eTech
            </div>
          </div>
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
            <a href="#">{t('footer.colNow')}</a>
            <a href="#">{t('footer.colTerms')}</a>
            <a href="#">{t('footer.colSchedule')}</a>
            <a href="#">{t('footer.colOffers')}</a>
          </div>
          <div className="footer-col">
            <a href="#">{t('footer.colSoon')}</a>
            <a href="#">{t('footer.colAbout')}</a>
            <a href="#">{t('footer.colContact')}</a>
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
