'use client'
import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { pickLang } from '@/lib/legal'

// Accès aux documents légaux depuis le front-office.
//
// Le pied de page est présent sur toutes les pages : sans cache, chaque
// navigation redemanderait la même liste. La réponse est donc mémorisée
// pour la durée de la session, par requête (avec ou sans le corps des
// documents). Une modification faite dans l'administration se voit au
// rechargement — ce que le cache HTTP de la route impose déjà de toute façon.

const cache = new Map()   // 'meta' | 'full' → Promise<{documents, settings}>

function load(withBody) {
  const key = withBody ? 'full' : 'meta'
  if (!cache.has(key)) {
    const promise = fetch(`/api/legal${withBody ? '?body=1' : ''}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .catch(err => { cache.delete(key); throw err })
    cache.set(key, promise)
  }
  return cache.get(key)
}

// À appeler après une écriture côté administration, pour que la page
// suivante reparte de la base et non du cache de session.
export function invalidateLegalCache() {
  cache.clear()
}

// { documents, settings, loading, error } — documents déjà projetés dans
// la langue courante par pickLang, prêts à l'affichage.
export function useLegalDocuments({ body = false } = {}) {
  const { lang } = useI18n()
  const [state, setState] = useState({ documents: [], settings: null, loading: true, error: null })

  useEffect(() => {
    let alive = true
    setState(s => ({ ...s, loading: true, error: null }))

    load(body)
      .then(data => {
        if (!alive) return
        setState({
          documents: (data.documents || []).map(d => pickLang(d, lang)),
          settings:  data.settings || null,
          loading:   false,
          error:     null,
        })
      })
      .catch(err => {
        if (!alive) return
        setState({ documents: [], settings: null, loading: false, error: err.message })
      })

    return () => { alive = false }
  }, [body, lang])

  return state
}

// Un document précis, corps compris. Utilisé par la page /legal/[slug],
// qui a besoin d'une version éventuellement archivée — cas que la liste
// mise en cache ne couvre pas.
export function useLegalDocument(slug, version) {
  const { lang } = useI18n()
  const [state, setState] = useState({ document: null, raw: null, loading: true, error: null })

  useEffect(() => {
    if (!slug) return
    let alive = true
    setState({ document: null, raw: null, loading: true, error: null })

    const query = Number(version) > 0 ? `?version=${Number(version)}` : ''
    fetch(`/api/legal/${encodeURIComponent(slug)}${query}`)
      .then(async r => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
        return data
      })
      .then(data => {
        if (!alive) return
        setState({
          document: pickLang(data.document, lang),
          raw:      data.document,
          loading:  false,
          error:    null,
        })
      })
      .catch(err => {
        if (!alive) return
        setState({ document: null, raw: null, loading: false, error: err.message })
      })

    return () => { alive = false }
  }, [slug, version, lang])

  return state
}
