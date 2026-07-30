'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { TableSkeleton } from '@/components/skeletons'
import { IconSearch, IconMail, IconTrash } from '@/components/icons'

// ─── Boîte de réception du formulaire de contact ──────────────────────────────
// Les messages portent des données personnelles : ils ne passent jamais par la
// clé anon. Tout transite par /api/admin/messages (service role + is_admin),
// contrairement aux autres pages d'admin qui interrogent Supabase directement.

const TZ = 'Etc/GMT-3'

const STATUS_MAP = {
  new:         { key: 'messages.statusNew',        cls: 'status-new'       },
  in_progress: { key: 'messages.statusInProgress', cls: 'status-progress'  },
  answered:    { key: 'messages.statusAnswered',   cls: 'status-answered'  },
  closed:      { key: 'messages.statusClosed',     cls: 'status-closed'    },
}
const STATUS_ORDER = ['new', 'in_progress', 'answered', 'closed']

function formatDate(str, locale = 'fr-FR') {
  if (!str) return '—'
  return new Date(str).toLocaleString(locale, { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' })
}

export default function AdminMessages() {
  const { t, locale } = useI18n()
  const [messages, setMessages] = useState([])
  const [counts,   setCounts]   = useState({ all: 0, new: 0, in_progress: 0, answered: 0, closed: 0 })
  const [loading,  setLoading]  = useState(true)
  const [loadErr,  setLoadErr]  = useState(false)
  const [filter,   setFilter]   = useState('all')
  const [search,   setSearch]   = useState('')
  const [expanded, setExpanded] = useState(null)
  const [busyId,   setBusyId]   = useState(null)

  // Note interne en cours d'édition — { [id]: texte }
  const [notes,    setNotes]    = useState({})
  const [noteSaved, setNoteSaved] = useState(null)
  const savedTimer = useRef(null)

  // Historique complet par adresse — { [email]: [messages] }. Chargé à part :
  // la liste affichée est filtrée, elle ne dit rien du passé de l'adresse.
  const [histories, setHistories] = useState({})

  useEffect(() => () => clearTimeout(savedTimer.current), [])

  const authToken = useCallback(async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase?.auth.getSession() ?? { data: {} }
    return session?.access_token
  }, [])

  const load = useCallback(async (f, q) => {
    setLoading(true)
    setLoadErr(false)
    try {
      const params = new URLSearchParams()
      if (f !== 'all') params.set('status', f)
      if (q.trim())    params.set('q', q.trim())

      const res = await fetch(`/api/admin/messages?${params}`, {
        headers: { Authorization: `Bearer ${await authToken()}` },
      })
      if (!res.ok) throw new Error('load_failed')
      const data = await res.json()
      setMessages(data.messages || [])
      setCounts(prev => data.counts || prev)
    } catch {
      setLoadErr(true)
      setMessages([])
    } finally {
      setLoading(false)
    }
  }, [authToken])

  useEffect(() => { load(filter, search) }, [filter])

  function onSearch(e) {
    e.preventDefault()
    load(filter, search)
  }

  async function patch(id, body) {
    setBusyId(id)
    try {
      const res = await fetch('/api/admin/messages', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authToken()}` },
        body:    JSON.stringify({ id, ...body }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error('patch_failed')

      setMessages(prev => prev.map(m => (m.id === id ? { ...m, ...data.message } : m)))
      // Les compteurs suivent le changement d'état sans recharger la liste
      if (body.status) {
        const before = messages.find(m => m.id === id)?.status
        if (before && before !== body.status) {
          setCounts(c => ({
            ...c,
            [before]: Math.max(0, (c[before] || 0) - 1),
            [body.status]: (c[body.status] || 0) + 1,
          }))
        }
      }
      return true
    } catch {
      return false
    } finally {
      setBusyId(null)
    }
  }

  async function saveNote(m) {
    const ok = await patch(m.id, { adminNote: notes[m.id] ?? m.admin_note ?? '' })
    if (!ok) return
    setNoteSaved(m.id)
    clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setNoteSaved(null), 2600)
  }

  async function remove(m) {
    if (!window.confirm(t('messages.deleteConfirm'))) return
    setBusyId(m.id)
    try {
      const res = await fetch('/api/admin/messages', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await authToken()}` },
        body:    JSON.stringify({ id: m.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error('delete_failed')

      setMessages(prev => prev.filter(x => x.id !== m.id))
      setCounts(c => ({ ...c, all: Math.max(0, c.all - 1), [m.status]: Math.max(0, (c[m.status] || 0) - 1) }))
      setExpanded(null)
    } catch {
      alert(t('messages.deleteError'))
    } finally {
      setBusyId(null)
    }
  }

  async function loadHistory(email) {
    const key = (email || '').toLowerCase()
    if (!key || histories[key]) return
    try {
      const res = await fetch(`/api/admin/messages?email=${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${await authToken()}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setHistories(prev => ({ ...prev, [key]: data.messages || [] }))
    } catch { /* le panneau reste utilisable sans l'historique */ }
  }

  // Ouvrir un message « nouveau » le fait passer en cours : l'état suit ce
  // qui s'est réellement passé, sans clic supplémentaire.
  function toggle(m) {
    if (expanded === m.id) { setExpanded(null); return }
    setExpanded(m.id)
    loadHistory(m.email)
    if (m.status === 'new') patch(m.id, { status: 'in_progress' })
  }

  const TABS = [
    { id: 'all',         label: t('messages.filterAll'),         n: counts.all },
    { id: 'new',         label: t('messages.statusNew'),         n: counts.new },
    { id: 'in_progress', label: t('messages.statusInProgress'),  n: counts.in_progress },
    { id: 'answered',    label: t('messages.statusAnswered'),    n: counts.answered },
    { id: 'closed',      label: t('messages.statusClosed'),      n: counts.closed },
  ]

  return (
    <div className="admin-page">
      <div className="admin-page-header">
        <h1 className="admin-page-title">{t('messages.title')}</h1>
        <span className="admin-page-count">
          {t('messages.count', { n: counts.all, count: counts.all })}
        </span>
      </div>

      <div className="admin-filters-row">
        <form className="admin-search-form" onSubmit={onSearch}>
          <input
            type="search"
            className="admin-search-input"
            placeholder={t('messages.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button type="submit" className="admin-search-btn">
            <IconSearch size={15} />
          </button>
        </form>

        <div className="admin-filter-tabs">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={`admin-filter-tab ${filter === tab.id ? 'active' : ''}`}
              onClick={() => setFilter(tab.id)}
            >
              {tab.label}
              <span className="amsg-tab-count">{tab.n}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={6} headers={[
          t('messages.thReceived'), t('messages.thSender'), t('messages.thSubject'),
          t('messages.thAccount'), t('messages.thStatus'),
        ]} />
      ) : loadErr ? (
        <div className="amsg-empty">
          <p className="admin-empty">{t('messages.loadError')}</p>
          <button className="adp-btn" onClick={() => load(filter, search)}>{t('messages.retry')}</button>
        </div>
      ) : messages.length === 0 ? (
        <div className="amsg-empty">
          <IconMail size={38} />
          <p className="admin-empty">
            {filter === 'all' && !search.trim() ? t('messages.empty') : t('messages.emptyFiltered')}
          </p>
          <p className="amsg-empty-hint">{t('messages.emptyHint')}</p>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('messages.thReceived')}</th>
                <th>{t('messages.thSender')}</th>
                <th>{t('messages.thSubject')}</th>
                <th>{t('messages.thAccount')}</th>
                <th>{t('messages.thStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {messages.map(m => {
                const st = STATUS_MAP[m.status] || STATUS_MAP.new
                const open = expanded === m.id
                return [
                  <tr
                    key={m.id}
                    className={`admin-tr admin-tr--clickable ${open ? 'admin-tr--open' : ''} ${m.status === 'new' ? 'amsg-tr--unread' : ''}`}
                    onClick={() => toggle(m)}
                  >
                    <td className="admin-td-meta">{formatDate(m.created_at, locale)}</td>
                    <td>
                      <div className="amsg-sender">
                        <span className="amsg-sender-name">{m.full_name}</span>
                        <span className="amsg-sender-mail">{m.email}</span>
                      </div>
                    </td>
                    <td>{t(`cform.subjects.${m.subject}`)}</td>
                    <td>
                      <span className={`admin-badge ${m.is_linked ? 'status-confirmed' : 'status-pending'}`}>
                        {m.is_linked ? t('messages.linked') : t('messages.notLinked')}
                      </span>
                    </td>
                    <td><span className={`admin-badge ${st.cls}`}>{t(st.key)}</span></td>
                  </tr>,

                  open && (
                    <tr key={`${m.id}-detail`} className="admin-tr-detail">
                      <td colSpan={5}>
                        <MessageDetail
                          m={m} t={t} locale={locale}
                          busy={busyId === m.id}
                          note={notes[m.id] ?? m.admin_note ?? ''}
                          noteSaved={noteSaved === m.id}
                          onNote={v => setNotes(p => ({ ...p, [m.id]: v }))}
                          onSaveNote={() => saveNote(m)}
                          onStatus={s => patch(m.id, { status: s })}
                          onDelete={() => remove(m)}
                          history={histories[(m.email || '').toLowerCase()]}
                        />
                      </td>
                    </tr>
                  ),
                ]
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Détail d'un message ───────────────────────────────────────────────────────
function MessageDetail({
  m, t, locale, busy, note, noteSaved, onNote, onSaveNote, onStatus, onDelete, history,
}) {
  const replySubject = encodeURIComponent(`Re: ${t(`cform.subjects.${m.subject}`)} — ${m.message_ref}`)

  // history === undefined tant que la requête n'a pas répondu : on ne dit
  // « première demande » qu'une fois l'historique réellement connu.
  const siblings = history?.filter(x => x.id !== m.id)

  return (
    <div className="admin-detail-panel">
      <div className="admin-detail-grid">
        <div>
          <p className="adp-label">{t('cform.okRef')}</p>
          <p className="adp-val"><code className="admin-ref">{m.message_ref}</code></p>
        </div>
        <div>
          <p className="adp-label">{t('contact.email')}</p>
          <p className="adp-val">{m.email}</p>
        </div>
        <div>
          <p className="adp-label">{t('contact.phone')}</p>
          <p className="adp-val">{m.phone || '—'}</p>
        </div>
        <div>
          <p className="adp-label">{t('messages.thAccount')}</p>
          <p className="adp-val">
            {m.is_linked
              ? t('messages.linkedHint', { name: m.account_name || m.full_name })
              : t('messages.notLinkedHint')}
          </p>
        </div>
        {m.answered_at && (
          <div>
            <p className="adp-label">{t('messages.statusAnswered')}</p>
            <p className="adp-val">{t('messages.answeredOn', { date: formatDate(m.answered_at, locale) })}</p>
          </div>
        )}
      </div>

      {/* Le message, tel qu'il a été écrit */}
      <p className="adp-sub-title">{t('messages.messageLabel')}</p>
      <blockquote className="amsg-body">{m.message}</blockquote>

      {/* État du traitement */}
      <p className="adp-sub-title">{t('messages.setStatus')}</p>
      <div className="amsg-status-row">
        {STATUS_ORDER.map(s => (
          <button
            key={s}
            className={`amsg-status-btn ${m.status === s ? 'active' : ''} ${STATUS_MAP[s].cls}`}
            disabled={busy}
            onClick={() => onStatus(s)}
          >
            {t(STATUS_MAP[s].key)}
          </button>
        ))}
      </div>

      {/* Note interne */}
      <p className="adp-sub-title">{t('messages.noteLabel')}</p>
      <textarea
        className="amsg-note"
        rows={3}
        maxLength={2000}
        placeholder={t('messages.notePlaceholder')}
        value={note}
        onChange={e => onNote(e.target.value)}
      />
      <div className="amsg-note-row">
        <button className="adp-btn" disabled={busy} onClick={onSaveNote}>
          {t('messages.noteSave')}
        </button>
        {noteSaved && <span className="amsg-note-saved">{t('messages.noteSaved')}</span>}
      </div>

      {/* Historique de la même adresse */}
      <p className="adp-sub-title">{t('messages.history')}</p>
      {siblings === undefined ? (
        <p className="amsg-history-none">{t('messages.historyLoading')}</p>
      ) : siblings.length === 0 ? (
        <p className="amsg-history-none">{t('messages.historyNone')}</p>
      ) : (
        <ul className="amsg-history">
          {siblings.map(s => (
            <li key={s.id}>
              <span className="amsg-history-date">{formatDate(s.created_at, locale)}</span>
              <span className="amsg-history-subject">{t(`cform.subjects.${s.subject}`)}</span>
              <span className={`admin-badge ${(STATUS_MAP[s.status] || STATUS_MAP.new).cls}`}>
                {t((STATUS_MAP[s.status] || STATUS_MAP.new).key)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="admin-detail-actions">
        <a
          className="adp-btn adp-btn--confirm"
          href={`mailto:${m.email}?subject=${replySubject}`}
        >
          <IconMail size={14} />
          {t('messages.reply')}
        </a>
        {m.phone && (
          <a className="adp-btn" href={`tel:${m.phone.replace(/\s/g, '')}`}>
            {t('messages.call')}
          </a>
        )}
        <button className="adp-btn adp-btn--delete" disabled={busy} onClick={onDelete}>
          <IconTrash size={14} />
          {t('messages.delete')}
        </button>
      </div>
    </div>
  )
}
