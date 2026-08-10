'use client'
import { useState, useEffect, useRef } from 'react'
import { useI18n } from '@/lib/i18n'
import LegalDocModal from '@/components/LegalDocModal'
import { IconCheck, IconLock, IconAlert } from '@/components/icons'

// ─── Les cases à cocher du consentement ───────────────────────────────────────
//
// Une case par groupe, jamais une seule case pour tout : accepter un contrat
// et consentir au traitement de ses données sont deux gestes distincts, et
// les mêler priverait le second de valeur.
//
// La case reste fermée tant que les documents qu'elle couvre n'ont pas été
// ouverts et parcourus jusqu'au bout. Le composant ne dit pas seulement
// « non » : il montre lesquels restent à lire, et le lien pour les ouvrir.
//
// Le dernier document lu jusqu'au bout coche la case. Redemander un clic
// après avoir descendu deux textes entiers ne prouve rien de plus : le geste
// qui engage, c'est la lecture, puis le bouton de validation. La case reste
// décochable — et une case sans verrou de lecture n'est jamais pré-cochée,
// sans quoi elle serait cochée à l'affichage, ce qu'aucun consentement ne
// supporte.
//
// Composant contrôlé — le parent tient la liste des groupes acceptés, parce
// que c'est lui qui devra l'envoyer à /api/legal/consent.

export default function LegalConsent({ groups, value = [], onChange, error = null }) {
  const { t } = useI18n()
  const [readSlugs, setReadSlugs] = useState(() => new Set())
  const [openDoc, setOpenDoc] = useState(null)

  // Les groupes déjà cochés d'eux-mêmes. Sans cette mémoire, décocher
  // rappellerait aussitôt l'effet, et la case se recocherait toute seule.
  const autoTicked = useRef(new Set())

  useEffect(() => {
    const ready = (groups || []).filter(g =>
      g.gated.length > 0 &&
      g.gated.every(slug => readSlugs.has(slug)) &&
      !value.includes(g.group) &&
      !autoTicked.current.has(g.group)
    )
    if (!ready.length) return

    ready.forEach(g => autoTicked.current.add(g.group))
    onChange?.([...new Set([...value, ...ready.map(g => g.group)])])
  }, [groups, readSlugs, value, onChange])

  if (!groups?.length) return null

  const markRead = slug => setReadSlugs(prev => (prev.has(slug) ? prev : new Set(prev).add(slug)))

  function toggle(group, checked) {
    const next = checked
      ? [...new Set([...value, group])]
      : value.filter(g => g !== group)
    onChange?.(next)
  }

  return (
    <div className="lgc">
      {groups.map(group => {
        const remaining = group.gated.filter(slug => !readSlugs.has(slug))
        const locked    = remaining.length > 0
        const checked   = value.includes(group.group)

        const remainingTitles = remaining
          .map(slug => group.documents.find(d => d.slug === slug)?.title)
          .filter(Boolean)
          .join(', ')

        return (
          <div key={group.group} className={`lgc-group ${locked ? 'is-locked' : ''} ${checked ? 'is-checked' : ''}`}>
            <label className="lgc-check">
              <input
                type="checkbox"
                checked={checked}
                disabled={locked}
                onChange={e => toggle(group.group, e.target.checked)}
                aria-describedby={`lgc-docs-${group.group}`}
              />
              <span className="lgc-box" aria-hidden="true">
                {locked ? <IconLock size={12} /> : <IconCheck size={13} />}
              </span>
              <span className="lgc-label">
                {group.label}
                <span className="lgc-req">{t('legal.required')}</span>
              </span>
            </label>

            {/* Les documents couverts par la case. Chacun s'ouvre à part et
                porte son propre état : c'est la liste de ce qu'il reste à
                faire, pas une simple énumération de liens. */}
            <ul className="lgc-docs" id={`lgc-docs-${group.group}`}>
              {group.documents.map(doc => {
                const done = !doc.scrollGate || readSlugs.has(doc.slug)
                return (
                  <li key={doc.slug}>
                    <button
                      type="button"
                      className={`lgc-doc ${done ? 'is-done' : ''}`}
                      onClick={() => setOpenDoc(doc)}
                    >
                      <span className="lgc-doc-mark" aria-hidden="true">
                        {done ? <IconCheck size={11} /> : null}
                      </span>
                      <span className="lgc-doc-title">{doc.title}</span>
                      <span className="lgc-doc-action">
                        {done ? t('legal.docRead') : t('legal.openDoc')}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>

            <p className={`lgc-hint ${locked ? '' : 'is-done'}`}>
              {locked
                ? t('legal.gateRemaining', { docs: remainingTitles })
                : t(checked ? 'legal.gateTicked' : 'legal.gateDone')}
            </p>
          </div>
        )
      })}

      {error && (
        <p className="lgc-error" role="alert">
          <IconAlert size={15} />
          {error}
        </p>
      )}

      {openDoc && (
        <LegalDocModal
          doc={openDoc}
          alreadyRead={readSlugs.has(openDoc.slug)}
          onRead={markRead}
          onClose={() => setOpenDoc(null)}
        />
      )}
    </div>
  )
}
