'use client'
import { useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder, CharacterCount } from '@tiptap/extensions'
import { useI18n } from '@/lib/i18n'

// ─── Éditeur de texte des documents légaux ────────────────────────────────────
//
// Volontairement pauvre. Un contrat se lit ; il ne se décore pas. La barre
// d'outils ne propose donc que ce que la page publique sait rendre — les
// mêmes balises exactement que la liste blanche de lib/legal.js. Offrir une
// couleur de texte ou une taille de police qui seraient effacées à
// l'enregistrement serait mentir à celui qui rédige.
//
// Deux titres seulement : « article » (h2, qui alimente le sommaire de la
// page publique) et « sous-titre » (h3). Le h1 appartient au titre du
// document, saisi à part — deux h1 dans une page, c'est un document qui ne
// sait pas de quoi il parle.

const EXTENSIONS = placeholder => [
  StarterKit.configure({
    heading: { levels: [2, 3, 4] },
    // Les liens sont insérés par le bouton, jamais suivis dans l'éditeur :
    // cliquer un lien en cours de rédaction ferait quitter la page.
    link: {
      openOnClick: false,
      autolink: true,
      protocols: ['mailto', 'tel'],
      HTMLAttributes: { rel: 'noopener noreferrer' },
    },
    codeBlock: false,
  }),
  Placeholder.configure({ placeholder }),
  CharacterCount,
]

function ToolButton({ onClick, active, disabled, title, children }) {
  return (
    <button
      type="button"
      className={`rte-btn ${active ? 'is-active' : ''}`}
      onMouseDown={e => e.preventDefault()}   // garde la sélection dans le texte
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active || undefined}
    >
      {children}
    </button>
  )
}

export default function RichEditor({ value, onChange, placeholder = '', ariaLabel }) {
  const { t } = useI18n()
  const incoming = useRef(value)

  const editor = useEditor({
    extensions: EXTENSIONS(placeholder),
    content: value || '',
    // Next rend d'abord côté serveur : laisser ProseMirror monter au premier
    // rendu déclencherait une divergence d'hydratation.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'rte-surface legal-prose',
        'aria-label': ariaLabel || '',
      },
    },
    onUpdate({ editor }) {
      const html = editor.isEmpty ? '' : editor.getHTML()
      incoming.current = html
      onChange?.(html)
    },
  }, [placeholder])

  // Changement de langue : le parent remplace le contenu sous nos pieds.
  // On ne réécrit que si la valeur diffère de ce que l'éditeur a lui-même
  // produit, sinon chaque frappe replacerait le curseur au début.
  useEffect(() => {
    if (!editor) return
    if (value === incoming.current) return
    incoming.current = value
    editor.commands.setContent(value || '', { emitUpdate: false })
  }, [value, editor])

  if (!editor) {
    return <div className="rte" aria-busy="true"><div className="rte-loading" /></div>
  }

  const setLink = () => {
    const previous = editor.getAttributes('link').href || ''
    const url = window.prompt(t('adminLegal.linkPrompt'), previous)
    if (url === null) return
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }

  const words = editor.storage.characterCount?.words?.() ?? 0

  return (
    <div className="rte">
      <div className="rte-bar" role="toolbar" aria-label={t('adminLegal.fldBody')}>
        <div className="rte-group">
          <ToolButton title={t('adminLegal.tbH2')} active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <span className="rte-glyph">H2</span>
          </ToolButton>
          <ToolButton title={t('adminLegal.tbH3')} active={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            <span className="rte-glyph">H3</span>
          </ToolButton>
        </div>

        <span className="rte-sep" aria-hidden="true" />

        <div className="rte-group">
          <ToolButton title={t('adminLegal.tbBold')} active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}>
            <span className="rte-glyph rte-glyph--b">B</span>
          </ToolButton>
          <ToolButton title={t('adminLegal.tbItalic')} active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}>
            <span className="rte-glyph rte-glyph--i">I</span>
          </ToolButton>
          <ToolButton title={t('adminLegal.tbUnderline')} active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <span className="rte-glyph rte-glyph--u">U</span>
          </ToolButton>
        </div>

        <span className="rte-sep" aria-hidden="true" />

        <div className="rte-group">
          <ToolButton title={t('adminLegal.tbBullet')} active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
              <circle cx="3.2" cy="5" r="1.5" fill="currentColor" />
              <circle cx="3.2" cy="10" r="1.5" fill="currentColor" />
              <circle cx="3.2" cy="15" r="1.5" fill="currentColor" />
              <path d="M7.4 5h9.4M7.4 10h9.4M7.4 15h9.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </ToolButton>
          <ToolButton title={t('adminLegal.tbOrdered')} active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
              <text x="0.6" y="7" fontSize="6.4" fill="currentColor" fontFamily="inherit">1</text>
              <text x="0.6" y="12.4" fontSize="6.4" fill="currentColor" fontFamily="inherit">2</text>
              <text x="0.6" y="17.8" fontSize="6.4" fill="currentColor" fontFamily="inherit">3</text>
              <path d="M7.4 5h9.4M7.4 10h9.4M7.4 15h9.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </ToolButton>
          <ToolButton title={t('adminLegal.tbQuote')} active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <span className="rte-glyph">&ldquo;</span>
          </ToolButton>
        </div>

        <span className="rte-sep" aria-hidden="true" />

        <div className="rte-group">
          <ToolButton title={t('adminLegal.tbLink')} active={editor.isActive('link')} onClick={setLink}>
            <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M8.4 11.6a3.4 3.4 0 004.8 0l2.6-2.6a3.4 3.4 0 10-4.8-4.8l-1 1" />
              <path d="M11.6 8.4a3.4 3.4 0 00-4.8 0l-2.6 2.6a3.4 3.4 0 104.8 4.8l1-1" />
            </svg>
          </ToolButton>
          <ToolButton title={t('adminLegal.tbUnlink')} disabled={!editor.isActive('link')}
            onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}>
            <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M8.4 11.6a3.4 3.4 0 004.8 0l1.2-1.2M11.6 8.4a3.4 3.4 0 00-4.8 0l-1.2 1.2" />
              <path d="M3.4 3.4l13.2 13.2" />
            </svg>
          </ToolButton>
          <ToolButton title={t('adminLegal.tbRule')}
            onClick={() => editor.chain().focus().setHorizontalRule().run()}>
            <span className="rte-glyph">—</span>
          </ToolButton>
        </div>

        <span className="rte-sep" aria-hidden="true" />

        <div className="rte-group">
          <ToolButton title={t('adminLegal.tbClear')}
            onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
            <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M6.6 15.4h9M4.4 12.2l6-6a1.8 1.8 0 012.6 0l2.6 2.6a1.8 1.8 0 010 2.6l-4 4H7z" />
            </svg>
          </ToolButton>
          <ToolButton title={t('adminLegal.tbUndo')} disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}>
            <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M7 5.4L3.6 8.8 7 12.2" />
              <path d="M3.6 8.8h7.8a4.6 4.6 0 010 9.2H8" />
            </svg>
          </ToolButton>
          <ToolButton title={t('adminLegal.tbRedo')} disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}>
            <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M13 5.4l3.4 3.4L13 12.2" />
              <path d="M16.4 8.8H8.6a4.6 4.6 0 000 9.2H12" />
            </svg>
          </ToolButton>
        </div>

        <span className="rte-count">{t('adminLegal.words', { n: words })}</span>
      </div>

      <EditorContent editor={editor} />
    </div>
  )
}
