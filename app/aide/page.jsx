'use client'

import Link from 'next/link'
import { useI18n } from '@/lib/i18n'
import { AideCarte } from '@/components/Aide'

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
// La numérotation du parcours est méritée — c'est une vraie séquence, chaque
// écran suit le précédent — contrairement aux sections, qui sont un sommaire
// et n'en portent aucune.

const ETAPES  = ['e1', 'e2', 'e3', 'e4']
const APRES   = ['a1', 'a2', 'a3', 'a4']
const QUESTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

const SECTIONS = [
  { id: 'etapes',   cle: 'guide.etapesTitre' },
  { id: 'carte',    cle: 'guide.carteTitre'  },
  { id: 'places',   cle: 'guide.placesTitre' },
  { id: 'apres',    cle: 'guide.apresTitre'  },
  { id: 'faq',      cle: 'guide.faqTitre'    },
]

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
        {SECTIONS.map(s => (
          <a key={s.id} href={`#${s.id}`} className="guide-puce">{t(s.cle)}</a>
        ))}
      </nav>

      {/* ── Le parcours ───────────────────────────────────────────────── */}
      <section className="guide-section" id="etapes">
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

      {/* ── La carte bancaire ─────────────────────────────────────────── */}
      <section className="guide-section" id="carte">
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

        <div className="guide-secu" id="paiement">
          <h3 className="guide-h3">{t('guide.secuTitre')}</h3>
          <p>{t('guide.secuTexte')}</p>
        </div>
      </section>

      {/* ── Le plan de la salle ───────────────────────────────────────── */}
      <section className="guide-section" id="places">
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

      {/* ── Après l'achat ─────────────────────────────────────────────── */}
      <section className="guide-section" id="apres">
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

      {/* ── Questions fréquentes ──────────────────────────────────────── */}
      {/* <details> natif : l'ouverture, le clavier et la recherche du
          navigateur fonctionnent sans une ligne de JavaScript. */}
      <section className="guide-section" id="faq">
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
