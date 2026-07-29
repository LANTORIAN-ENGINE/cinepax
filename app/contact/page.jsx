'use client'

import { useState, useEffect } from 'react'
import { useI18n } from '@/lib/i18n'
import { CONTACT } from '@/lib/contenu'

// ─── Contactez-nous ───────────────────────────────────────────────────────────
// L'adresse et le téléphone viennent de /api/site (Veezi /v1/site) : ce sont
// les coordonnées déclarées au back-office, pas une copie figée. Les horaires
// d'ouverture, l'e-mail et les réseaux ne figurent nulle part dans l'API et
// sont repris de cinepax.mg — voir lib/contenu.js.

const MAPS_EMBED = q =>
  `https://maps.google.com/maps?&q=${encodeURIComponent(q)}&z=17&t=q&output=embed`

// Veezi stocke le numéro d'une traite (+261340573500) : on le regroupe au
// format malgache, +261 34 05 735 00.
function formatPhone(raw) {
  if (!raw) return null
  const digits = raw.replace(/[^\d]/g, '')
  const national = digits.startsWith('261') ? digits.slice(3) : digits
  if (national.length !== 9) return raw
  const [, a, b, c, d] = national.match(/^(\d{2})(\d{2})(\d{3})(\d{2})$/) || []
  return a ? `+261 ${a} ${b} ${c} ${d}` : raw
}

export default function ContactPage() {
  const { t } = useI18n()
  const [site, setSite] = useState(null)

  useEffect(() => {
    fetch('/api/site')
      .then(r => r.json())
      .then(d => { if (!d.error) setSite(d) })
      .catch(() => {})
  }, [])

  // Veezi stocke l'adresse en majuscules sur trois lignes libres.
  const address = site?.addressLines?.length
    ? [...site.addressLines, [site.postcode, site.country].filter(Boolean).join(' ')].filter(Boolean)
    : null

  return (
    <div className="page-container">
      <div className="section-header">
        <h1 className="section-title">{t('contact.title')}</h1>
      </div>
      <hr className="section-divider" />

      <div className="contact-layout">
        <div className="contact-details">
          <section className="contact-block">
            <h2 className="contact-label">{t('contact.address')}</h2>
            {address
              ? <address className="contact-address">{address.map(l => <span key={l}>{l}</span>)}</address>
              : <address className="contact-address"><span>Tana Water Front, Antananarivo, Madagascar</span></address>
            }
          </section>

          <section className="contact-block">
            <h2 className="contact-label">{t('contact.reach')}</h2>
            <ul className="contact-lines">
              <li>
                <span className="contact-line-label">{t('contact.phone')}</span>
                <a href={`tel:${(site?.phone || CONTACT.phoneDisplay).replace(/\s/g, '')}`}>
                  {formatPhone(site?.phone) || CONTACT.phoneDisplay}
                </a>
              </li>
              <li>
                <span className="contact-line-label">WhatsApp</span>
                <a href={`https://wa.me/${CONTACT.whatsapp.replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer">
                  {CONTACT.whatsapp}
                </a>
              </li>
              <li>
                <span className="contact-line-label">{t('contact.email')}</span>
                <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
              </li>
              <li>
                <span className="contact-line-label">{t('contact.sales')}</span>
                <a href={`mailto:${CONTACT.salesEmail}`}>{CONTACT.salesEmail}</a>
              </li>
            </ul>
          </section>

          <section className="contact-block">
            <h2 className="contact-label">{t('contact.hours')}</h2>
            <ul className="hours-list">
              {CONTACT.hours.map(h => (
                <li key={h.day} className={`hours-row ${h.closed ? 'is-closed' : ''}`}>
                  <span className="hours-day">{h.day}</span>
                  <span className="hours-value">{h.value}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="contact-block">
            <h2 className="contact-label">{t('contact.follow')}</h2>
            <div className="contact-socials">
              {CONTACT.socials.map(s => (
                <a key={s.label} href={s.href} target="_blank" rel="noreferrer" className="contact-social">
                  {s.label}
                </a>
              ))}
            </div>
          </section>
        </div>

        <div className="contact-map">
          <iframe
            src={MAPS_EMBED(CONTACT.mapQuery)}
            title={t('contact.mapTitle')}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  )
}
