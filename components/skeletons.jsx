'use client'

// Écrans d'attente des espaces client et administration.
//
// Deux règles guident ces composants :
//
//   1. Le squelette a la forme de ce qui arrive. Un rond là où viendra un
//      avatar, une barre haute là où viendra un grand nombre. L'œil se place
//      avant que la donnée n'arrive, et rien ne saute au remplacement.
//
//   2. On ne fantôme pas ce qu'on connaît déjà. Les en-têtes de tableau, les
//      intitulés de la barre latérale et les libellés des chiffres sont des
//      chaînes statiques : on les affiche pour de vrai. Seules les valeurs
//      inconnues deviennent des barres. C'est ce qui distingue un squelette
//      utile d'un gabarit gris.

import { useI18n } from '@/lib/i18n'
import { WEEK_ORDER, weekdayName } from '@/lib/tarifs'

// Barre fantôme. `w` accepte n'importe quelle longueur CSS, `d` décale
// l'animation pour que les blocs s'allument dans l'ordre de lecture.
function Bar({ w = '100%', h = 12, r = 4, d = 0, className = '' }) {
  return (
    <span
      className={`ask ${className}`}
      style={{ width: w, height: h, borderRadius: r, '--ask-d': `${d}s` }}
    />
  )
}

/* ── Barre latérale + page, pendant la vérification des droits ──────────────
   Les intitulés restent en barres : tant que l'accès n'est pas confirmé, on
   n'affiche pas la structure de l'administration. */
export function AdminChromeSkeleton() {
  return (
    <div className="admin-wrap" aria-busy="true" aria-label="Chargement">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <Bar w={64} h={11} />
          <span style={{ display: 'block', height: 5 }} />
          <Bar w={112} h={9} d={0.04} />
        </div>
        <nav className="admin-nav">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="ask-nav-row">
              <Bar w={20} h={20} r={5} d={0.06 * i} />
              <Bar w={`${68 - i * 7}%`} h={11} d={0.06 * i + 0.03} />
            </div>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          {[0, 1].map(i => (
            <div key={i} className="ask-nav-row">
              <Bar w={20} h={20} r={5} d={0.3 + 0.06 * i} />
              <Bar w={`${54 - i * 8}%`} h={11} d={0.33 + 0.06 * i} />
            </div>
          ))}
        </div>
      </aside>

      <div className="admin-content">
        <div className="admin-page">
          <div className="admin-page-header">
            <Bar w={210} h={26} r={6} />
            <Bar w={130} h={12} d={0.06} />
          </div>
          <div className="ask-rail">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="ask-rail-cell">
                <Bar w="58%" h={10} d={0.05 * i} />
                <Bar w="44%" h={30} r={6} d={0.05 * i + 0.04} />
              </div>
            ))}
          </div>
          <TableSkeleton cols={6} rows={5} />
        </div>
      </div>
    </div>
  )
}

/* ── Tableau de bord ────────────────────────────────────────────────────────
   Les quatre intitulés sont connus : ils s'affichent en clair, seuls les
   nombres attendent. */
export function DashboardSkeleton() {
  const { t } = useI18n()
  const labels = [
    t('dashboard.todayRevenue'),
    t('dashboard.todayBookings'),
    t('dashboard.confirmedSeats'),
    t('dashboard.registeredClients'),
  ]

  return (
    <div className="admin-page" aria-busy="true">
      <div className="admin-page-header">
        <h1 className="admin-page-title">{t('dashboard.title')}</h1>
        <Bar w={140} h={12} d={0.05} />
      </div>

      <div className="dash-rail">
        {labels.map((label, i) => (
          <div key={label} className={`dash-figure ${i === 0 ? 'dash-figure--lead' : ''}`}>
            <p className="dash-figure-label">{label}</p>
            <Bar w={i === 0 ? '78%' : '38%'} h={30} r={6} d={0.05 * i} />
          </div>
        ))}
      </div>

      <div className="admin-section">
        <div className="admin-section-header">
          <h2 className="admin-section-title">{t('dashboard.latest')}</h2>
        </div>
        <TableSkeleton rows={6} headers={[
          t('dashboard.thReference'), t('dashboard.thFilm'), t('dashboard.thSession'),
          t('dashboard.thClient'), t('dashboard.thAmount'), t('dashboard.thStatus'),
        ]} />
      </div>
    </div>
  )
}

/* ── Corps de tableau ───────────────────────────────────────────────────────
   `headers` fournis → le vrai en-tête est rendu et les colonnes se figent
   tout de suite. Sans lui (squelette de page entière), on retombe sur des
   barres. Les largeurs varient d'une colonne à l'autre : des barres toutes
   identiques se lisent comme une grille, pas comme des données. */
const COL_WIDTHS = ['72%', '86%', '64%', '58%', '46%', '52%', '40%', '60%', '30%']

export function TableSkeleton({ cols = 6, rows = 6, headers = null }) {
  return (
    <div className="admin-table-wrap" aria-busy="true">
      <table className="admin-table">
        <thead>
          <tr>
            {headers
              ? headers.map((h, i) => <th key={i}>{h}</th>)
              : Array.from({ length: cols }).map((_, i) => (
                  <th key={i}><Bar w="70%" h={9} d={0.03 * i} /></th>
                ))
            }
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: headers ? headers.length : cols }).map((_, c) => (
                <td key={c}>
                  <Bar
                    w={COL_WIDTHS[c % COL_WIDTHS.length]}
                    h={11}
                    d={r * 0.05 + c * 0.02}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Grilles tarifaires ─────────────────────────────────────────────────────
   Une liste de cartes, pas un tableau : le squelette reprend la découpe
   pastille de couleur / nom / actions de PriceCardRow. */
export function PriceCardsSkeleton({ rows = 4 }) {
  return (
    <div className="pc-cards-grid" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="pc-card">
          <div className="pc-card-row">
            <div className="pc-card-color-wrap">
              <Bar w={14} h={14} r={4} d={i * 0.08} />
              <Bar w={62} h={26} r={6} d={i * 0.08 + 0.03} />
            </div>
            <div className="pc-card-names">
              <Bar w={`${52 + (i % 3) * 9}%`} h={17} r={5} d={i * 0.08 + 0.06} />
              <span style={{ display: 'block', height: 6 }} />
              <Bar w={`${32 + (i % 2) * 8}%`} h={10} d={i * 0.08 + 0.09} />
            </div>
            <div className="pc-card-actions">
              <Bar w={108} h={30} r={6} d={i * 0.08 + 0.12} />
              <Bar w={72}  h={30} r={6} d={i * 0.08 + 0.15} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Semainier des tarifs ───────────────────────────────────────────────────
   Les sept jours sont connus d'avance : on les écrit. Seuls le prix et le
   décompte des séances attendent l'API, et ils attendent à leur place. */
export function TarifWeekSkeleton() {
  const { locale } = useI18n()

  return (
    <ol className="tarif-week" aria-busy="true">
      {WEEK_ORDER.map((day, i) => (
        <li key={day} className="tarif-day" style={{ '--i': i }}>
          <div className="tarif-day-head">
            <span className="tarif-day-name">{weekdayName(day, locale)}</span>
          </div>
          <div className="tarif-day-flags" />
          <p className="tarif-price"><Bar w={86} h={28} r={5} d={i * 0.05} /></p>
          <p className="tarif-meta"><Bar w="76%" h={10} d={i * 0.05 + 0.04} /></p>
        </li>
      ))}
    </ol>
  )
}

/* ── Espace client ──────────────────────────────────────────────────────────
   Les onglets sont statiques, seul leur compteur attend. Les cartes reprennent
   la découpe du talon de billet, perforation comprise : la forme d'attente est
   déjà celle du contenu. */
export function AccountSkeleton() {
  const { t } = useI18n()

  return (
    <div className="compte-page" aria-busy="true">
      <div className="compte-header">
        <div className="compte-header-inner">
          <Bar w={56} h={56} r="50%" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Bar w={182} h={17} r={5} d={0.05} />
            <span style={{ display: 'block', height: 7 }} />
            <Bar w={224} h={12} d={0.09} />
          </div>
          <Bar w={132} h={36} r={6} d={0.13} />
        </div>
      </div>

      <div className="compte-tabs-wrap">
        <div className="compte-tabs">
          <button className="compte-tab active" disabled>
            {t('account.tabBookings')}
            <Bar w={22} h={16} r={999} d={0.1} />
          </button>
          <button className="compte-tab" disabled>{t('account.tabProfile')}</button>
        </div>
      </div>

      <div className="compte-content">
        <h2 className="compte-section-title">{t('account.upcoming')}</h2>
        <div className="compte-cards">
          {[0, 1].map(i => <BookingCardSkeleton key={i} delay={i * 0.12} />)}
        </div>
      </div>
    </div>
  )
}

function BookingCardSkeleton({ delay = 0 }) {
  return (
    <div className="bk-card">
      <div className="bk-card-main">
        <div className="bk-card-left">
          <Bar w={92}    h={9}  d={delay} />
          <Bar w="62%"   h={19} r={5} d={delay + 0.04} />
          <Bar w="46%"   h={12} d={delay + 0.08} />
          <Bar w="30%"   h={12} d={delay + 0.12} />
          <Bar w={104}   h={15} r={5} d={delay + 0.16} />
        </div>
        <div className="bk-card-right">
          <Bar w={86}     h={22} r={999} d={delay + 0.06} />
          <Bar w="100%"   h={33} r={6}   d={delay + 0.1} />
          <Bar w="100%"   h={33} r={6}   d={delay + 0.14} />
        </div>
      </div>
    </div>
  )
}
