'use client'
import { useI18n } from '@/lib/i18n'
import { SLUG_CGV } from '@/lib/legal'
import LegalDocLink from '@/components/LegalDocLink'

// ─── Rappel des conditions de vente, au ras du bouton qui engage ──────────────
//
// Pas de case à cocher ici. Le client titulaire d'un compte a déjà accepté
// les conditions de vente à l'inscription, et redemander la même chose à
// chaque achat transformerait un consentement en formalité qu'on expédie
// sans lire. Ce qui manque à cet endroit, c'est le rappel de ce qu'on
// engage — et le texte à portée de clic, sans quitter le paiement.
//
// La phrase vit dans le dictionnaire avec un jeton {cgv} à la place du lien :
// c'est la seule façon d'obtenir une syntaxe correcte dans les deux langues,
// où le lien ne tombe pas au même endroit de la phrase.

export default function LegalCheckoutNotice({ className = '' }) {
  const { t } = useI18n()
  const [before, after = ''] = t('legal.checkoutNotice').split('{cgv}')

  return (
    <p className={`legal-checkout ${className}`.trim()}>
      {before}
      <LegalDocLink slug={SLUG_CGV}>{t('legal.checkoutCgv')}</LegalDocLink>
      {after}
    </p>
  )
}
