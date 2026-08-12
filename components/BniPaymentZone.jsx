'use client'
import { useEffect, useRef } from 'react'

// ─── Zone de paiement BNI / MIPS ──────────────────────────────────────────────
// La passerelle nous renvoie un fragment de HTML tout fait :
//
//   <script src="https://go.mips.mu/gomips.js"></script>
//   <iframe id="mipsIframe" class="gomips" allow="payment" src="https://go.mips.mu/mipsit.php?c=…">
//
// Ce fragment doit entrer dans la page **une seule fois**. L'iframe est une
// session bancaire vivante : la reposer, c'est la rouvrir à zéro, et le numéro
// de carte à moitié saisi part avec.
//
// C'est exactement ce que faisait `dangerouslySetInnerHTML`. React 19 ne
// compare plus la chaîne `__html` : il compare l'objet `{ __html }` par
// identité (`nextProp !== lastProp` dans `updateProperties`). Or `{ __html: x }`
// écrit dans le JSX est un objet neuf à chaque rendu — donc jamais égal au
// précédent, donc `domElement.innerHTML = …` réexécuté à chaque rendu, donc
// iframe détruite et rechargée. Le tunnel se redessine toutes les 30 secondes
// (l'horloge qui referme les séances) : le client perdait sa saisie deux fois
// par minute, sans rien avoir fait.
//
// Ici l'hôte est un `<div ref>` sans enfant JSX : React n'a rien à réconcilier
// dedans, et n'y touchera plus jamais. Le contenu est posé à la main, une fois,
// et seulement si le HTML a réellement changé.
export default function BniPaymentZone({ html, className }) {
  const hoteRef = useRef(null)
  // HTML déjà posé. Compare les chaînes, pas les rendus : un nouveau rendu avec
  // le même HTML ne doit rien faire.
  const poseRef = useRef(null)

  useEffect(() => {
    const hote = hoteRef.current
    if (!hote || !html || poseRef.current === html) return
    poseRef.current = html
    hote.replaceChildren()

    // `innerHTML` n'exécute jamais les `<script>` qu'il pose (spécification
    // HTML) : gomips.js n'a donc jamais tourné depuis que l'intégration
    // existe. On le remet en marche, mais dans le bon ordre — il cherche
    // l'iframe dès qu'il s'exécute, elle doit déjà être là. D'où : le balisage
    // d'abord, les scripts recréés ensuite.
    const gabarit = document.createElement('template')
    gabarit.innerHTML = html
    const scripts = [...gabarit.content.querySelectorAll('script')]
    for (const script of scripts) script.remove()

    hote.appendChild(gabarit.content)

    // Le script n'apporte que le voile d'attente et la feuille de style de la
    // passerelle (`.gomips`, `.mipsLoader` — rien d'autre n'est ciblé). S'il
    // échoue, le paiement doit continuer sans lui.
    try {
      for (const ancien of scripts) {
        const script = document.createElement('script')
        for (const { name, value } of ancien.attributes) script.setAttribute(name, value)
        script.textContent = ancien.textContent
        hote.appendChild(script)
      }
    } catch {
      /* la zone de paiement est en place, c'est le seul point qui compte */
    }
  }, [html])

  return <div className={className} ref={hoteRef} />
}
