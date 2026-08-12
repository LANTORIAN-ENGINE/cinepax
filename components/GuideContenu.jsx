'use client'

import { useI18n } from '@/lib/i18n'
import AideCarte from './AideCarte'

// ─── Le contenu du guide, écrit une seule fois ────────────────────────────────
//
// Le guide se lit à deux endroits : la page /aide, qu'on ouvre pour lire, et le
// modal que les bulles du tunnel ouvrent par-dessus l'achat. Deux cadres, un
// seul texte — sinon la réponse à « combien de chiffres ? » finirait par
// différer selon l'endroit où on la lit.
//
// Les ancres portent un préfixe : sur /aide c'est `#carte`, dans le modal
// `#gm-carte`. Rien n'oblige les deux à coexister aujourd'hui, mais deux `id`
// identiques dans un document sont un bogue qui attend son heure.

const ETAPES    = ['e1', 'e2', 'e3', 'e4']
const APRES     = ['a1', 'a2', 'a3', 'a4']
const QUESTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export const SECTIONS_GUIDE = [
  { id: 'etapes', cle: 'guide.etapesTitre' },
  { id: 'carte',  cle: 'guide.carteTitre'  },
  { id: 'places', cle: 'guide.placesTitre' },
  { id: 'apres',  cle: 'guide.apresTitre'  },
  { id: 'faq',    cle: 'guide.faqTitre'    },
]

// Les bulles renvoient à une ancre, qui n'est pas toujours une section : le
// paiement est un encart *dans* la section carte. La table dit à quelle
// section appartient chaque ancre — le sommaire a besoin de le savoir pour
// marquer la bonne puce.
export const SECTION_DE_L_ANCRE = {
  etapes:   'etapes',
  carte:    'carte',
  paiement: 'carte',
  places:   'places',
  apres:    'apres',
  faq:      'faq',
}

// Les états du plan, avec la pastille réelle du plan de salle : la légende du
// guide et celle du gradin sont le même objet, pas deux dessins qui se
// ressemblent.
const ETATS = [
  { cls: 'available',   cle: 'guide.pLibre'     },
  { cls: 'taken',       cle: 'guide.pOccupe'    },
  { cls: 'house',       cle: 'guide.pMaison'    },
  { cls: 'companion',   cle: 'guide.pCompanion' },
  { cls: 'broken',      cle: 'guide.pBrise'     },
]

export function SectionsGuide({ prefixe = '' }) {
  const { t } = useI18n()
  const anc = id => `${prefixe}${id}`

  return (
    <>
      {/* ── Le parcours ─────────────────────────────────────────────────── */}
      <section className="guide-section" id={anc('etapes')}>
        <h2 className="guide-h2">{t('guide.etapesTitre')}</h2>
        <p className="guide-sous">{t('guide.etapesLead')}</p>

        <ol className="guide-etapes">
          {ETAPES.map((e, i) => (
            <li key={e} className="guide-etape">
              <span className="guide-etape-num" aria-hidden="true">{i + 1}</span>
              <div className="guide-etape-texte">
                <h3 className="guide-etape-titre">{t(`guide.${e}t`)}</h3>
                <p>{t(`guide.${e}c`)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── La carte bancaire ───────────────────────────────────────────── */}
      <section className="guide-section" id={anc('carte')}>
        <h2 className="guide-h2">{t('guide.carteTitre')}</h2>
        <p className="guide-sous">{t('guide.carteLead')}</p>

        <div className="guide-carte">
          <div className="guide-carte-tableau">
            <table className="guide-tab">
              <thead>
                <tr>
                  <th scope="col">{t('guide.thChamp')}</th>
                  <th scope="col">{t('guide.thCombien')}</th>
                  <th scope="col">{t('guide.thOu')}</th>
                </tr>
              </thead>
              <tbody>
                {['cNum', 'cExp', 'cCvc', 'cNom'].map(c => (
                  <tr key={c}>
                    <th scope="row">{t(`guide.${c}`)}</th>
                    <td className="guide-tab-combien">{t(`guide.${c}N`)}</td>
                    <td>{t(`guide.${c}Ou`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="guide-note">{t('guide.carteAmex')}</p>
          </div>

          <div className="guide-carte-schemas">
            <AideCarte face="recto" />
            <AideCarte face="dos" />
          </div>
        </div>

        <div className="guide-secu" id={anc('paiement')}>
          <h3 className="guide-h3">{t('guide.secuTitre')}</h3>
          <p>{t('guide.secuTexte')}</p>
        </div>
      </section>

      {/* ── Le plan de la salle ─────────────────────────────────────────── */}
      <section className="guide-section" id={anc('places')}>
        <h2 className="guide-h2">{t('guide.placesTitre')}</h2>
        <p className="guide-sous">{t('guide.placesLead')}</p>

        <ul className="guide-etats">
          {ETATS.map(e => (
            <li key={e.cls} className="guide-etat">
              <span className={`legend-chip seat-chip--${e.cls}`} aria-hidden="true" />
              <span>{t(e.cle)}</span>
            </li>
          ))}
        </ul>

        <p className="guide-note">{t('guide.placesGris')}</p>
      </section>

      {/* ── Après l'achat ───────────────────────────────────────────────── */}
      <section className="guide-section" id={anc('apres')}>
        <h2 className="guide-h2">{t('guide.apresTitre')}</h2>
        <p className="guide-sous">{t('guide.apresLead')}</p>

        <div className="guide-apres">
          {APRES.map(a => (
            <div key={a} className="guide-fiche">
              <h3 className="guide-fiche-titre">{t(`guide.${a}t`)}</h3>
              <p>{t(`guide.${a}c`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Questions fréquentes ────────────────────────────────────────── */}
      {/* <details> natif : l'ouverture, le clavier et la recherche du
          navigateur fonctionnent sans une ligne de JavaScript. */}
      <section className="guide-section" id={anc('faq')}>
        <h2 className="guide-h2">{t('guide.faqTitre')}</h2>

        <div className="guide-faq">
          {QUESTIONS.map(n => (
            <details key={n} className="guide-q">
              <summary className="guide-q-titre">
                {t(`guide.q${n}`)}
                <span className="guide-q-signe" aria-hidden="true" />
              </summary>
              <p className="guide-q-rep">{t(`guide.r${n}`)}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  )
}
