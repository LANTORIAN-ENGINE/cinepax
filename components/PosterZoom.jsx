'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { IconClose, IconZoomIn, IconZoomOut } from '@/components/icons'

// ─── Visionneuse de l'affiche ─────────────────────────────────────────────────
// L'affiche du programme fait 1080×1920 : sur la page elle tient dans la hauteur
// de la fenêtre, ce qui met les horaires autour de 10 px. Ils sont lisibles, mais
// de justesse. Cette visionneuse existe pour ça et rien d'autre — approcher un
// jour de la semaine jusqu'à pouvoir lire l'heure sans plisser les yeux.
//
// Trois gestes, tous ceux qu'on essaie spontanément sur une image :
//   molette / pincement   zoomer autour du point visé, pas du centre du cadre
//   glisser               déplacer, dès que l'image dépasse du cadre
//   double-clic           aller-retour entre l'affiche entière et ×2,5
//
// Le zoom s'ancre sur le curseur : c'est ce qui fait qu'on garde le mardi sous
// les yeux quand on approche, au lieu de le voir filer hors du cadre.

const MIN = 1
const MAX = 5
const DOUBLE = 2.5
const WHEEL_SENSITIVITY = 0.0022

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

const clampScale = s => Math.min(MAX, Math.max(MIN, s))

export default function PosterZoom({ src, alt, onClose }) {
  const { t } = useI18n()

  const [view, setView] = useState(IDENTITY)
  const [dragging, setDragging] = useState(false)

  const rootRef   = useRef(null)
  const stageRef  = useRef(null)
  const imgRef    = useRef(null)
  const closeRef  = useRef(null)
  const viewRef   = useRef(IDENTITY)
  // Pointeurs actifs : un seul pour glisser, deux pour pincer. Le même
  // registre sert aux deux gestes, la souris et le doigt passant par la même
  // API — il n'y a pas de branche « tactile » à maintenir à part.
  const pointers  = useRef(new Map())
  const pinch     = useRef(null)
  // Un glissement se termine par un clic, et la capture du pointeur adresse ce
  // clic au cadre lui-même — c'est-à-dire à la zone dont le clic referme la
  // visionneuse. Sans quoi promener une affiche zoomée la referme.
  //
  // On compare le clic à l'endroit de l'appui plutôt que de compter les
  // pointermove : c'est le clic qui décide, et il porte ses propres
  // coordonnées. Aucun registre à tenir, rien à remettre à zéro.
  const pressAt   = useRef(null)

  viewRef.current = view

  const apply = useCallback(next => {
    setView(clampView(next, imgRef.current))
  }, [])

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
  }, [apply])

  // ── Clavier ────────────────────────────────────────────────────────────
  // La visionneuse recouvre la page : tant qu'elle est ouverte, le fond ne
  // défile pas, la tabulation tourne dans la barre d'outils, et le focus
  // revient d'où il venait à la fermeture.
  useEffect(() => {
    const opener = document.activeElement
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const onKey = e => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
      if (e.key !== 'Tab') return

      const focusables = [...(rootRef.current?.querySelectorAll('button:not(:disabled)') || [])]
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
  }, [onClose])

  // ── Molette ────────────────────────────────────────────────────────────
  // Écouteur non passif posé à la main : React ne permet pas de déclarer
  // onWheel avec { passive: false }, et sans preventDefault la page défile
  // derrière l'affiche pendant qu'on zoome.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return

    const onWheel = e => {
      e.preventDefault()
      const v = viewRef.current
      const next = clampScale(v.scale * Math.exp(-e.deltaY * WHEEL_SENSITIVITY))
      if (next === v.scale) return
      const [px, py] = framePoint(e.clientX, e.clientY)
      apply(zoomAround(v, next, px, py))
    }

    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [apply, framePoint])

  // ── Glisser et pincer ──────────────────────────────────────────────────
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

    // Une affiche à sa taille d'origine n'a nulle part où aller : le
    // glissement reste sans effet plutôt que de la faire flotter.
    if (viewRef.current.scale <= MIN) return
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
    if (v.scale > MIN) return apply(IDENTITY)
    const [px, py] = framePoint(e.clientX, e.clientY)
    apply(zoomAround(v, DOUBLE, px, py))
  }

  // Le vide autour de l'affiche referme, comme partout ailleurs sur le site.
  // Trois pixels de tolérance : une main qui clique n'est jamais tout à fait
  // immobile, et un clic net doit rester un clic.
  function closeOnEmptyClick(e) {
    if (e.target !== e.currentTarget) return
    const from = pressAt.current
    if (from && (Math.abs(e.clientX - from.x) > 3 || Math.abs(e.clientY - from.y) > 3)) return
    onClose()
  }

  const zoomed = view.scale > MIN

  return (
    <div
      ref={rootRef}
      className="pzoom"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={closeOnEmptyClick}
    >
      <div className="pzoom-bar">
        <div className="pzoom-tools">
          <button
            type="button"
            className="pzoom-btn"
            onClick={() => zoomBy(1 / 1.4)}
            disabled={view.scale <= MIN}
            aria-label={t('programme.zoomOut')}
          >
            <IconZoomOut size={18} />
          </button>
          {/* Pas de région vivante : le niveau change à chaque cran de
              molette, un lecteur d'écran le répéterait sans fin. */}
          <span className="pzoom-level">{Math.round(view.scale * 100)}%</span>
          <button
            type="button"
            className="pzoom-btn"
            onClick={() => zoomBy(1.4)}
            disabled={view.scale >= MAX}
            aria-label={t('programme.zoomIn')}
          >
            <IconZoomIn size={18} />
          </button>
          <button
            type="button"
            className="pzoom-reset"
            onClick={() => apply(IDENTITY)}
            disabled={!zoomed}
          >
            {t('programme.zoomReset')}
          </button>
        </div>

        <button
          ref={closeRef}
          type="button"
          className="pzoom-btn pzoom-close"
          onClick={onClose}
          aria-label={t('programme.zoomClose')}
        >
          <IconClose size={18} />
        </button>
      </div>

      <div
        ref={stageRef}
        className={`pzoom-stage ${zoomed ? 'is-zoomed' : ''} ${dragging ? 'is-dragging' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onClick={closeOnEmptyClick}
      >
        <img
          ref={imgRef}
          className="pzoom-img"
          src={src}
          alt={alt}
          draggable="false"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
        />
      </div>

      <p className="pzoom-hint">{t('programme.zoomHint')}</p>
    </div>
  )
}
