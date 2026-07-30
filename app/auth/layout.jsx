'use client'
import { usePathname } from 'next/navigation'
import { useI18n } from '@/lib/i18n'

// Rend un texte multi-ligne (séparé par \n) avec des <br/>
function MultiLine({ text }) {
  return text.split('\n').map((line, i) => (
    <span key={i}>{i > 0 && <br />}{line}</span>
  ))
}

// Le panneau visuel vit ici plutôt que dans chaque page : un layout traverse
// la navigation sans être remonté. C'est ce qui permet à la pellicule
// d'avancer d'une image d'un bord à l'autre du passage connexion ⇄
// inscription, là où deux pages séparées la feraient repartir de zéro.
export default function AuthLayout({ children }) {
  const { t } = useI18n()
  const pathname = usePathname()
  const mode = pathname.startsWith('/auth/register') ? 'register' : 'login'

  return (
    <div className={`auth-page auth-page--${mode}`}>
      <div className="auth-artwork" aria-hidden>
        <div className="auth-artwork-inner">
          <div className="auth-film-strip">
            {Array.from({ length: 11 }).map((_, i) => (
              <div key={i} className="auth-film-frame" />
            ))}
          </div>

          {/* La clé sur le mode fait remplacer le bloc par React : le texte
              ne change pas sous l'œil, il se repose. */}
          <div className="auth-artwork-text" key={mode}>
            <p className="auth-artwork-eyebrow">{t('auth.eyebrow')}</p>
            <h2 className="auth-artwork-headline">
              <MultiLine text={t(mode === 'register' ? 'auth.registerHeadline' : 'auth.loginHeadline')} />
            </h2>
            <p className="auth-artwork-sub">
              {t(mode === 'register' ? 'auth.registerArtSub' : 'auth.loginArtSub')}
            </p>
          </div>
        </div>
      </div>

      {children}
    </div>
  )
}
