'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ─── Les gestes d'une visionneuse ─────────────────────────────────────────────
// Deux visionneuses sur le site montrent une image trop dense pour la page qui
// la porte : l'affiche du programme, dont les horaires font 10 px, et les
// visuels de « Nos offres », dont les tarifs et les numéros sont imprimés en
// petit. Elles n'ont pas la même mise en page — l'une est plein cadre, l'autre
// range un texte à côté — mais elles ont exactement les mêmes gestes.
//
// Ce sont ces gestes qui vivent ici. La géométrie du zoom ancré au curseur est
// délicate à écrire ; elle n'a pas à l'être deux fois.

const IDENTITY = { scale: 1, x: 0, y: 0 }

// Zoome en gardant fixe le point de l'image survolé. On ne connaît pas ce
// point : on sait seulement qu'il est projeté en (px, py) dans le cadre, et
// qu'il doit y rester. Le rapport des échelles suffit à en déduire la
// translation — inutile de repasser par les coordonnées de l'image.
function zoomAround(view, next, px, py) {
  const k = next / view.scale
  return {
    scale: next,
    x: px - k * (px - view.x),
    y: py - k * (py - view.y),
  }
}

// L'image ne peut pas s'échapper du cadre : au-delà de la marge que le zoom a
// créée, il n'y a plus rien à montrer. Sans cette limite, un glissement un peu
// vif laisse un rectangle vide et on ne sait plus où l'on est.
function clampView(view, el) {
  if (!el) return view
  const mx = Math.max(0, (el.offsetWidth * view.scale - el.offsetWidth) / 2)
  const my = Math.max(0, (el.offsetHeight * view.scale - el.offsetHeight) / 2)
  return {
    scale: view.scale,
    x: Math.min(mx, Math.max(-mx, view.x)),
    y: Math.min(my, Math.max(-my, view.y)),
  }
}

/**
 * Molette, pincement, glisser, double-clic — sur une image posée dans un cadre.
 *
 * Rend les liaisons à répandre sur le balisage : `stageRef` et `stageProps` sur
 * le cadre, `imgRef` et `imgStyle` sur l'image. Le reste (`zoomBy`, `reset`,
 * `zoomed`) commande la barre d'outils.
 */
export function useZoomPan({ min = 1, max = 5, double = 2.5, wheelSensitivity = 0.0022 } = {}) {
  const [view, setView] = useState(IDENTITY)
  const [dragging, setDragging] = useState(false)

  const stageRef = useRef(null)
  const imgRef   = useRef(null)
  const viewRef  = useRef(IDENTITY)
  // Pointeurs actifs : un seul pour glisser, deux pour pincer. Le même
  // registre sert aux deux gestes, la souris et le doigt passant par la même
  // API — il n'y a pas de branche « tactile » à maintenir à part.
  const pointers = useRef(new Map())
  const pinch    = useRef(null)
  // Un glissement se termine par un clic, et la capture du pointeur adresse ce
  // clic au cadre lui-même — c'est-à-dire à la zone dont le clic referme la
  // visionneuse. Sans quoi promener une affiche zoomée la referme.
  //
  // On compare le clic à l'endroit de l'appui plutôt que de compter les
  // pointermove : c'est le clic qui décide, et il porte ses propres
  // coordonnées. Aucun registre à tenir, rien à remettre à zéro.
  const pressAt = useRef(null)

  viewRef.current = view

  const clampScale = useCallback(s => Math.min(max, Math.max(min, s)), [min, max])

  const apply = useCallback(next => {
    setView(clampView(next, imgRef.current))
  }, [])

  const reset = useCallback(() => apply(IDENTITY), [apply])

  // Centre du cadre : origine commune aux boutons, au double-clic et à la
  // molette. Les coordonnées de zoomAround sont relatives à ce point.
  const framePoint = useCallback((clientX, clientY) => {
    const r = stageRef.current?.getBoundingClientRect()
    if (!r) return [0, 0]
    return [clientX - (r.left + r.width / 2), clientY - (r.top + r.height / 2)]
  }, [])

  const zoomBy = useCallback(factor => {
    const v = viewRef.current
    apply(zoomAround(v, clampScale(v.scale * factor), 0, 0))
  }, [apply, clampScale])

  // ── Molette ──────────────────────────────────────────────────────────────
  // Écouteur non passif posé à la main : React ne permet pas de déclarer
  // onWheel avec { passive: false }, et sans preventDefault la page défile
  // derrière l'image pendant qu'on zoome.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const onWheel = e => {
      e.preventDefault()
      const v = viewRef.current
      const next = clampScale(v.scale * Math.exp(-e.deltaY * wheelSensitivity))
      if (next === v.scale) return
      const [px, py] = framePoint(e.clientX, e.clientY)
      apply(zoomAround(v, next, px, py))
    }

    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [apply, framePoint, clampScale, wheelSensitivity])

  // ── Glisser et pincer ────────────────────────────────────────────────────
  function onPointerDown(e) {
    if (e.button != null && e.button !== 0) return
    // La capture échoue si le pointeur n'est plus actif au moment de l'appel :
    // elle est un confort — la perdre ne doit pas emporter le geste.
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch {}
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    pressAt.current = { x: e.clientX, y: e.clientY }

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        scale: viewRef.current.scale,
      }
    } else {
      setDragging(true)
    }
  }

  function onPointerMove(e) {
    const prev = pointers.current.get(e.pointerId)
    if (!prev) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size >= 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()]
      const distance = Math.hypot(a.x - b.x, a.y - b.y)
      if (!pinch.current.distance) return
      const next = clampScale(pinch.current.scale * (distance / pinch.current.distance))
      const [px, py] = framePoint((a.x + b.x) / 2, (a.y + b.y) / 2)
      apply(zoomAround(viewRef.current, next, px, py))
      return
    }

    // Une image à sa taille d'origine n'a nulle part où aller : le glissement
    // reste sans effet plutôt que de la faire flotter.
    if (viewRef.current.scale <= min) return
    const v = viewRef.current
    apply({ scale: v.scale, x: v.x + (e.clientX - prev.x), y: v.y + (e.clientY - prev.y) })
  }

  function onPointerUp(e) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 0) setDragging(false)
  }

  function onDoubleClick(e) {
    const v = viewRef.current
    if (v.scale > min) return reset()
    const [px, py] = framePoint(e.clientX, e.clientY)
    apply(zoomAround(v, double, px, py))
  }

  // Un clic net, par opposition à la fin d'un glissement. Trois pixels de
  // tolérance : une main qui clique n'est jamais tout à fait immobile.
  const isClick = useCallback(e => {
    const from = pressAt.current
    return !from || (Math.abs(e.clientX - from.x) <= 3 && Math.abs(e.clientY - from.y) <= 3)
  }, [])

  return {
    view,
    dragging,
    zoomed: view.scale > min,
    atMin: view.scale <= min,
    atMax: view.scale >= max,
    stageRef,
    imgRef,
    zoomBy,
    reset,
    isClick,
    stageProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onDoubleClick,
    },
    imgStyle: { transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` },
  }
}

/**
 * Ce qu'une fenêtre modale doit à la page qu'elle recouvre : le fond ne défile
 * pas, la tabulation tourne à l'intérieur, Échap referme, et le focus revient
 * d'où il venait à la fermeture.
 */
export function useDialogChrome({ rootRef, onClose, focusRef }) {
  useEffect(() => {
    const opener = document.activeElement
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    focusRef?.current?.focus()

    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
      if (e.key !== 'Tab') return

      const focusables = [...(rootRef.current?.querySelectorAll(
        'a[href], button:not(:disabled)',
      ) || [])]
      if (focusables.length === 0) return
      const first = focusables[0]
      const last  = focusables[focusables.length - 1]
      const at    = document.activeElement

      // Un bouton qui vient de se désactiver (dézoomer à 100 %) sort de la
      // liste sans rendre le focus : on le ramène plutôt que de le perdre.
      if (!focusables.includes(at)) { e.preventDefault(); first.focus(); return }
      if (e.shiftKey && at === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus() }
    }

    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [rootRef, onClose, focusRef])
}
