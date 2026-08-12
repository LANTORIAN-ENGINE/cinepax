'use client'

import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'
import { IconClose, IconArrowRight } from '@/components/icons'
import { SECTIONS_GUIDE, SECTION_DE_L_ANCRE, SectionsGuide } from './GuideContenu'

// ─── Le guide, posé par-dessus l'achat ────────────────────────────────────────
//
// « Voir le guide » ouvrait /aide. Au milieu du paiement, c'était quitter la
// page : la session bancaire de la BNI se referme avec elle, les places
// choisies aussi. Le client qui cherchait où lire son cryptogramme perdait son
// achat pour l'avoir demandé.
//
// Le guide vient donc à lui. Une fiche posée sur le comptoir, qu'on referme :
// derrière, rien n'a bougé — l'iframe de la banque n'est pas démontée, l'étape
// n'a pas changé, et le pied de la fiche le dit en toutes lettres, parce que
// c'est exactement la crainte qui fait hésiter à cliquer.
//
// Le sommaire reste visible pendant qu'on lit et suit le défilement : ouvert
// sur « la carte bancaire », on voit qu'il existe aussi une FAQ, et on y va
// sans revenir en arrière. C'est ce qui fait la différence entre un modal et
// un guide.
//
// Trois soins d'ouverture :
//   • on arrive **à** la section demandée, pas en haut d'un mur de texte ;
//   • cette section s'allume une seconde — le saut s'explique de lui-même ;
//   • le saut d'arrivée est sec, seuls les sauts qu'on demande ensuite
//     glissent : une page qui défile toute seule à l'ouverture désoriente.

const MARGE_ANCRE = 18   // px au-dessus du titre visé, pour qu'il respire
const MARGE_SPY   = 96   // px sous le haut du cadre : la ligne qui décide

export default function GuideModal({ ancre = 'etapes', onClose }) {
  const { t } = useI18n()
  const [monte, setMonte] = useState(false)
  const [actif, setActif] = useState(SECTION_DE_L_ANCRE[ancre] || 'etapes')

  const corpsRef   = useRef(null)
  const panneauRef = useRef(null)
  const fermerRef  = useRef(null)
  const sommRef    = useRef(null)

  useEffect(() => { setMonte(true) }, [])

  const glisseOk = () =>
    typeof window !== 'undefined' &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Le cadre défilant est le repère : `offsetTop` d'une section est compté
  // depuis lui, à condition qu'il soit son `offsetParent` — d'où le
  // `position: relative` sur `.gm-corps`.
  const allerA = useCallback((id, doux = true) => {
    const corps = corpsRef.current
    const cible = corps?.querySelector(`#gm-${id}`)
    if (!corps || !cible) return
    corps.scrollTo({
      top: Math.max(0, cible.offsetTop - MARGE_ANCRE),
      behavior: doux && glisseOk() ? 'smooth' : 'auto',
    })
    setActif(SECTION_DE_L_ANCRE[id] || id)
  }, [])

  // Arrivée : on se pose sur la section demandée avant la première image
  // peinte, sinon le guide s'ouvre en haut puis saute.
  useLayoutEffect(() => {
    if (!monte) return
    allerA(ancre, false)

    // La puce active peut être hors du champ du sommaire sur un téléphone.
    sommRef.current
      ?.querySelector('.est-actif')
      ?.scrollIntoView({ inline: 'center', block: 'nearest' })

    // Le repère lumineux : il dit pourquoi on est arrivé là. Il s'éteint
    // seul, et `prefers-reduced-motion` le supprime en CSS.
    const vise = corpsRef.current?.querySelector(`#gm-${ancre}`)
    vise?.classList.add('est-visee')
    const fin = setTimeout(() => vise?.classList.remove('est-visee'), 1700)
    return () => clearTimeout(fin)
  }, [monte, ancre, allerA])

  // Le sommaire suit la lecture : la section active est la dernière dont le
  // titre est passé au-dessus de la ligne de décision.
  useEffect(() => {
    const corps = corpsRef.current
    if (!corps) return

    let attend = false
    function surDefilement() {
      if (attend) return
      attend = true
      requestAnimationFrame(() => {
        attend = false
        const limite = corps.scrollTop + MARGE_SPY
        let courante = SECTIONS_GUIDE[0].id
        for (const s of SECTIONS_GUIDE) {
          const el = corps.querySelector(`#gm-${s.id}`)
          if (el && el.offsetTop <= limite) courante = s.id
        }
        // Le bas de course marque toujours la dernière section : sans cela,
        // une FAQ plus courte que le cadre ne s'allume jamais.
        if (corps.scrollTop + corps.clientHeight >= corps.scrollHeight - 4) {
          courante = SECTIONS_GUIDE[SECTIONS_GUIDE.length - 1].id
        }
        setActif(courante)
      })
    }

    corps.addEventListener('scroll', surDefilement, { passive: true })
    return () => corps.removeEventListener('scroll', surDefilement)
  }, [monte])

  // Ouverture : la page derrière ne défile plus, et le focus entre dans la
  // fiche.
  //
  // Le retour du focus, lui, appartient à l'appelant. Le bouton d'où l'on
  // vient disparaît parfois avec la bulle qui le portait — le rendre à
  // « l'élément actif au montage » ramènerait alors au <body>, c'est-à-dire
  // nulle part. Aide le rend au repère, AideNote à son propre lien.
  useEffect(() => {
    if (!monte) return

    const avant = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    fermerRef.current?.focus()

    return () => { document.body.style.overflow = avant }
  }, [monte])

  // Échap ferme ; Tab tourne en rond dans la fiche. La capture est
  // nécessaire : la bulle d'aide écoute aussi Échap, et ne doit pas se
  // refermer derrière nous.
  useEffect(() => {
    function surTouche(e) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return }
      if (e.key !== 'Tab') return

      const cibles = panneauRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
      )
      if (!cibles?.length) return

      const premier = cibles[0]
      const dernier = cibles[cibles.length - 1]
      if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus() }
      else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus() }
    }

    document.addEventListener('keydown', surTouche, true)
    return () => document.removeEventListener('keydown', surTouche, true)
  }, [onClose])

  if (!monte) return null

  // `preventDefault` sur le voile : sans lui, le navigateur pose le focus
  // dessus après le gestionnaire — c'est-à-dire sur le <body> — et efface le
  // retour que l'appelant vient de faire.
  return createPortal(
    <div
      className="gm-voile"
      onMouseDown={e => {
        if (e.target !== e.currentTarget) return
        e.preventDefault()
        onClose?.()
      }}
    >
      <div
        className="gm-panneau"
        ref={panneauRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gm-titre"
      >
        <header className="gm-tete">
          <div className="gm-tete-texte">
            <p className="gm-surtitre">{t('guide.eyebrow')}</p>
            <h2 className="gm-titre" id="gm-titre">{t('guide.titre')}</h2>
          </div>
          <button
            type="button"
            className="gm-croix"
            onClick={onClose}
            ref={fermerRef}
            aria-label={t('guide.modalRetour')}
          >
            <IconClose size={18} />
          </button>
        </header>

        <nav className="gm-sommaire" aria-label={t('guide.sommaire')} ref={sommRef}>
          {SECTIONS_GUIDE.map(s => (
            <button
              key={s.id}
              type="button"
              className={`guide-puce ${actif === s.id ? 'est-actif' : ''}`}
              aria-current={actif === s.id ? 'true' : undefined}
              onClick={() => allerA(s.id)}
            >
              {t(s.cle)}
            </button>
          ))}
        </nav>

        <div className="gm-corps" ref={corpsRef} tabIndex={0}>
          <SectionsGuide prefixe="gm-" />
        </div>

        <footer className="gm-pied">
          <p className="gm-rassure">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"
                 width="13" height="13" aria-hidden="true">
              <path d="M8 1.8l5.2 2v3.6c0 3-2.1 5.4-5.2 6.8-3.1-1.4-5.2-3.8-5.2-6.8V3.8l5.2-2z"
                    strokeLinejoin="round" />
            </svg>
            {t('guide.modalRester')}
          </p>

          <div className="gm-actions">
            <a href="/aide" target="_blank" rel="noreferrer" className="gm-pleine">
              {t('guide.modalPleinePage')}
              <IconArrowRight size={13} />
            </a>
            <button type="button" className="gm-retour" onClick={onClose}>
              {t('guide.modalRetour')}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  )
}
