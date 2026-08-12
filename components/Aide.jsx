'use client'

import { useState, useRef, useEffect, useLayoutEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'
import GuideModal from './GuideModal'

export { default as AideCarte } from './AideCarte'

// ─── L'aide au ras du champ ───────────────────────────────────────────────────
//
// Au guichet, le client hésite et la caissière se penche : elle pointe l'endroit
// du formulaire et dit la chose en une phrase. C'est tout ce que fait ce
// composant — un repère posé contre le libellé qui pose la question, et une
// bulle dont la pointe vise exactement le champ concerné.
//
// Ce n'est pas un `title=` : il n'existe pas au doigt, arrive après une seconde
// de survol, et ne peut contenir ni schéma ni lien. Le trafic de Cinepax est
// majoritairement mobile, donc l'ouverture est un clic — jamais un survol, qui
// enlèverait la bulle au moment où on tend le doigt vers le lien qu'elle
// contient.
//
// Deux formes selon la place disponible :
//   • au-dessus de 560 px — une bulle ancrée sous le repère, en `position:
//     fixed` pour n'être rognée par aucun parent qui déborde ;
//   • en dessous — une feuille qui monte du bas de l'écran, seule forme
//     lisible quand la bulle ferait la moitié de la largeur du téléphone.
//
// Chaque bulle peut renvoyer au guide complet : la réponse courte ici, le
// déroulé là-bas. « Là-bas » n'est pas une autre page — au milieu du paiement,
// la quitter referme la session bancaire et perd les places choisies. Le guide
// s'ouvre donc par-dessus, en modal (`GuideModal`), et se referme sur l'achat
// intact.

const SEUIL_FEUILLE = 560

export default function Aide({
  titre,
  ancre,            // fragment de /aide ; sans lui, pas de renvoi au guide
  children,
  className = '',
  place = 'auto',   // 'auto' | 'gauche' — cale la bulle à gauche du repère
}) {
  const { t } = useI18n()
  const [ouvert, setOuvert] = useState(false)
  const [feuille, setFeuille] = useState(false)
  const [pos, setPos] = useState(null)
  const [guide, setGuide] = useState(null)
  const repereRef = useRef(null)
  const bulleRef = useRef(null)
  const id = useId()

  // Position de la bulle, recalculée à l'ouverture puis à chaque défilement.
  // `pret` reste faux le temps de la mesure : la bulle est rendue mais
  // invisible, sinon elle apparaîtrait une image au mauvais endroit.
  function placer() {
    const repere = repereRef.current
    const bulle = bulleRef.current
    if (!repere || !bulle) return
    const r = repere.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const l = bulle.offsetWidth
    const h = bulle.offsetHeight
    const marge = 12

    const centre = r.left + r.width / 2
    let gauche = place === 'gauche' ? r.right - l : centre - l / 2
    gauche = Math.min(Math.max(marge, gauche), vw - l - marge)

    // Sous le repère par défaut ; au-dessus s'il n'y a pas la place en bas et
    // qu'il y en a en haut. Le débordement restant est absorbé par le
    // défilement interne de la bulle.
    const dessous = r.bottom + 10 + h <= vh - marge || r.top - 10 - h < marge
    const haut = dessous ? r.bottom + 10 : r.top - 10 - h

    setPos({
      gauche,
      haut,
      dessous,
      // La pointe vise le centre du repère, sans jamais sortir de l'arrondi.
      pointe: Math.min(Math.max(14, centre - gauche), l - 14),
      pret: true,
    })
  }

  useLayoutEffect(() => {
    if (!ouvert || feuille) return
    placer()
  }, [ouvert, feuille])

  useEffect(() => {
    if (!ouvert) return

    function surTouche(e) { if (e.key === 'Escape') fermer() }
    function surClic(e) {
      if (repereRef.current?.contains(e.target)) return
      if (bulleRef.current?.contains(e.target)) return
      setOuvert(false)
    }
    function surMouvement() {
      if (feuille) return
      placer()
    }

    document.addEventListener('keydown', surTouche)
    document.addEventListener('mousedown', surClic)
    document.addEventListener('touchstart', surClic)
    window.addEventListener('scroll', surMouvement, true)
    window.addEventListener('resize', surMouvement)
    return () => {
      document.removeEventListener('keydown', surTouche)
      document.removeEventListener('mousedown', surClic)
      document.removeEventListener('touchstart', surClic)
      window.removeEventListener('scroll', surMouvement, true)
      window.removeEventListener('resize', surMouvement)
    }
  }, [ouvert, feuille])

  function fermer() {
    setOuvert(false)
    repereRef.current?.focus()
  }

  function basculer() {
    if (ouvert) { setOuvert(false); return }
    setFeuille(window.innerWidth <= SEUIL_FEUILLE)
    setPos(null)
    setOuvert(true)
  }

  const corps = (
    <>
      <p className="aide-titre" id={`${id}-titre`}>{titre}</p>
      <div className="aide-corps">{children}</div>
      {ancre && (
        // La bulle s'efface au profit du guide : deux surfaces d'aide
        // empilées ne se lisent pas, et celle du dessous serait cachée.
        <button
          type="button"
          className="aide-lien"
          onClick={() => { setOuvert(false); setGuide(ancre) }}
        >
          {t('aide.toutLeGuide')}
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11" aria-hidden="true">
            <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </>
  )

  return (
    <>
      <button
        type="button"
        ref={repereRef}
        className={`aide-repere ${ouvert ? 'est-ouvert' : ''} ${className}`.trim()}
        onClick={basculer}
        aria-expanded={ouvert}
        aria-controls={ouvert ? id : undefined}
        aria-label={t('aide.repereAria', { sujet: titre })}
      >
        <span aria-hidden="true">?</span>
      </button>

      {/* La bulle sort du document et se raccroche à <body>. Deux raisons :
          elle se pose parfois contre un libellé qui vit dans un <p> ou un
          <h2>, où un <div> n'a rien à faire ; et une superposition en
          position fixe n'a pas à dépendre de l'empilement de ses ancêtres.
          Le lien avec le repère reste énoncé par aria-controls. */}
      {ouvert && feuille && createPortal(
        <div className="aide-voile" onClick={() => setOuvert(false)}>
          <div
            className="aide-feuille"
            id={id}
            role="dialog"
            aria-modal="false"
            aria-labelledby={`${id}-titre`}
            ref={bulleRef}
            onClick={e => e.stopPropagation()}
          >
            <span className="aide-poignee" aria-hidden="true" />
            {corps}
            <button type="button" className="aide-fermer" onClick={fermer}>
              {t('aide.fermer')}
            </button>
          </div>
        </div>,
        document.body
      )}

      {ouvert && !feuille && createPortal(
        <div
          className={`aide-bulle ${pos?.dessous ? 'est-dessous' : 'est-dessus'} ${pos?.pret ? 'est-posee' : ''}`}
          id={id}
          role="dialog"
          aria-modal="false"
          aria-labelledby={`${id}-titre`}
          ref={bulleRef}
          style={pos ? {
            left: `${pos.gauche}px`,
            top: `${pos.haut}px`,
            '--aide-pointe': `${pos.pointe}px`,
          } : undefined}
        >
          <span className="aide-pointe" aria-hidden="true" />
          {corps}
        </div>,
        document.body
      )}

      {/* Le lien du guide part avec la bulle qu'il portait : le modal ne
          retrouverait rien à qui rendre le focus. On le ramène au repère,
          d'où tout est reparti. */}
      {guide && (
        <GuideModal
          ancre={guide}
          onClose={() => { setGuide(null); repereRef.current?.focus() }}
        />
      )}
    </>
  )
}

// ─── La règle de chiffres ─────────────────────────────────────────────────────
//
// « Combien de chiffres ? » ne se répond pas bien par une phrase : il faut
// croire le nombre, puis compter soi-même ce qu'on a tapé. La règle montre les
// emplacements attendus, groupés comme ils le sont sur la carte, et se remplit
// au rythme de la frappe. Le client voit 12 sur 16 sans compter.
//
// `saisis` est le nombre de chiffres déjà tapés — pas le texte : la règle ne
// doit jamais afficher le numéro de carte, même en clair chez son propriétaire.
export function AideChiffres({ saisis = 0, total = 16, groupe = 4 }) {
  const { t } = useI18n()
  const cases = Array.from({ length: total }, (_, i) => i < saisis)
  const groupes = []
  for (let i = 0; i < total; i += groupe) groupes.push(cases.slice(i, i + groupe))
  const complet = saisis >= total

  return (
    <div className="aide-regle">
      <div className="aide-regle-cases" aria-hidden="true">
        {groupes.map((g, gi) => (
          <span key={gi} className="aide-regle-groupe">
            {g.map((pleine, ci) => (
              <span key={ci} className={`aide-regle-case ${pleine ? 'est-pleine' : ''}`} />
            ))}
          </span>
        ))}
      </div>
      {/* Pas d'aria-live : le compte change à chaque touche et couperait la
          parole au lecteur d'écran pendant la saisie. Le nombre attendu est
          déjà dit en toutes lettres dans la phrase au-dessus. */}
      <p className={`aide-regle-compte ${complet ? 'est-complet' : ''}`}>
        {complet
          ? t('aide.chiffresComplet', { total })
          : t('aide.chiffresCompte', { saisis, total })}
      </p>
    </div>
  )
}

// ─── La note posée dans le flux ───────────────────────────────────────────────
//
// Tout ne se demande pas : certaines explications doivent être lues sans qu'on
// pense à cliquer, parce que le client ne sait pas encore qu'il a une question.
// C'est le cas quand l'écran affiche quelque chose d'inattendu — un plan de
// salle entièrement grisé, un tarif absent. La note le dit à voix basse, à
// l'endroit où l'anomalie se voit.
//
// `ton="attention"` pour ce qui empêche d'avancer ; `ton="calme"` (défaut) pour
// ce qui explique seulement.
export function AideNote({ titre, children, ancre, ton = 'calme', className = '' }) {
  const { t } = useI18n()
  const [guide, setGuide] = useState(false)
  const lienRef = useRef(null)

  return (
    <div className={`aide-note aide-note--${ton} ${className}`.trim()} role="note">
      <svg className="aide-note-icone" viewBox="0 0 20 20" fill="none"
           stroke="currentColor" strokeWidth="1.7" width="15" height="15" aria-hidden="true">
        <circle cx="10" cy="10" r="7.6" />
        <path d="M10 9.4v4.2" strokeLinecap="round" />
        <path d="M10 6.4h.01" strokeLinecap="round" />
      </svg>
      <div className="aide-note-texte">
        {titre && <strong className="aide-note-titre">{titre}</strong>}
        {children}
        {ancre && (
          <button type="button" className="aide-note-lien" ref={lienRef}
                  onClick={() => setGuide(true)}>
            {t('aide.toutLeGuide')}
          </button>
        )}
      </div>

      {/* La note du paiement est posée au-dessus de l'iframe de la BNI. Le
          modal sort par un portail : le sous-arbre du paiement n'est pas
          retouché, la saisie de carte en cours est intacte au retour.

          Le focus est rendu explicitement : un clic à la souris pose bien
          le focus sur le bouton, mais pas une ouverture au clavier depuis
          un autre chemin. On ne laisse pas ce détail au navigateur. */}
      {guide && (
        <GuideModal
          ancre={ancre}
          onClose={() => { setGuide(false); lienRef.current?.focus() }}
        />
      )}
    </div>
  )
}
