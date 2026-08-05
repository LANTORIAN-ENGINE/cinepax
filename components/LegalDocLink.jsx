'use client'
import { useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { pickLang, legalPath } from '@/lib/legal'
import LegalDocModal from '@/components/LegalDocModal'

// Un lien qui ouvre le document sans quitter la page.
//
// Partout où un texte légal est cité au fil d'une phrase — la ligne des
// conditions de vente au moment de payer, le bandeau d'accueil — envoyer le
// client sur une autre page lui ferait perdre son panier ou son formulaire.
// Le document s'ouvre donc par-dessus, et se referme là où il en était.
//
// Le corps n'est chargé qu'au clic : ces liens sont présents sur des écrans
// que la plupart des visiteurs traversent sans jamais les ouvrir.
//
// Le lien reste un vrai <a> : clic milieu, « ouvrir dans un nouvel onglet »
// et navigation sans JavaScript continuent de fonctionner.

export default function LegalDocLink({ slug, children, className = '', gate = false }) {
  const { lang } = useI18n()
  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(false)

  async function open(e) {
    // Un clic modifié veut dire « ailleurs » : on laisse le navigateur faire.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    if (loading || doc) return

    setLoading(true)
    try {
      const res  = await fetch(`/api/legal/${encodeURIComponent(slug)}`)
      const data = await res.json()
      if (res.ok && data.document) {
        setDoc({ ...pickLang(data.document, lang), scrollGate: gate })
      } else {
        // Le document n'est plus publié : la page dédiée saura le dire
        // mieux qu'un modal vide.
        window.location.href = legalPath(slug)
      }
    } catch {
      window.location.href = legalPath(slug)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <a
        href={legalPath(slug)}
        className={`legal-inline-link ${className}`.trim()}
        onClick={open}
        aria-busy={loading || undefined}
      >
        {children}
      </a>
      {doc && <LegalDocModal doc={doc} onClose={() => setDoc(null)} alreadyRead />}
    </>
  )
}
