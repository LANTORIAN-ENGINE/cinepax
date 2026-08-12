'use client'

import Link from 'next/link'
import { useI18n } from '@/lib/i18n'
import { SECTIONS_GUIDE, SectionsGuide } from '@/components/GuideContenu'

// ─── Le guide d'achat ─────────────────────────────────────────────────────────
//
// Les bulles du tunnel répondent à une question, là où elle se pose. Cette
// page fait l'autre travail : raconter le parcours entier, une fois, pour qui
// veut savoir avant de commencer — ou pour qui est bloqué et cherche.
//
// Elle est écrite pour être lue par quelqu'un qui n'a jamais acheté de billet
// en ligne. D'où le tableau de la carte bancaire, qui donne le seul chiffre
// qu'on cherche vraiment dans ce moment-là : combien de chiffres taper, et où
// les lire sur l'objet qu'on a en main.
//
// Le texte lui-même vit dans `components/GuideContenu` : les bulles du tunnel
// ouvrent les mêmes sections en modal, par-dessus l'achat, et deux copies du
// nombre de chiffres à taper finiraient par ne plus dire la même chose.
//
// La numérotation du parcours est méritée — c'est une vraie séquence, chaque
// écran suit le précédent — contrairement aux sections, qui sont un sommaire
// et n'en portent aucune.

export default function AidePage() {
  const { t } = useI18n()

  return (
    <div className="page-container guide-page">

      <div className="section-header">
        <div>
          <p className="guide-eyebrow">{t('guide.eyebrow')}</p>
          <h1 className="section-title">{t('guide.titre')}</h1>
        </div>
      </div>
      <hr className="section-divider" />

      <p className="guide-lead">{t('guide.lead')}</p>

      <nav className="guide-sommaire" aria-label={t('guide.sommaire')}>
        {SECTIONS_GUIDE.map(s => (
          <a key={s.id} href={`#${s.id}`} className="guide-puce">{t(s.cle)}</a>
        ))}
      </nav>

      <SectionsGuide />

      <div className="guide-contact">
        <div>
          <h2 className="guide-contact-titre">{t('guide.aideTitre')}</h2>
          <p className="guide-contact-texte">{t('guide.aideTexte')}</p>
        </div>
        <Link href="/contact" className="btn-primary guide-contact-cta">
          {t('guide.aideCta')}
        </Link>
      </div>

    </div>
  )
}
