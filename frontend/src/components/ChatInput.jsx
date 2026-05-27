import { useRef, useState } from 'react'

/**
 * Auto-resizing textarea input for chat messages.
 *
 * @param {Object} props
 * @param {(text: string) => void} props.onSend - Called with trimmed text when user submits.
 * @param {boolean} props.disabled - Disables the input while streaming or when no doc is selected.
 * @param {boolean} props.noDocSelected - When true, shows an inline warning on Enter.
 */
export default function ChatInput({ onSend, disabled, noDocSelected }) {
  const [text, setText] = useState('')
  const [showWarning, setShowWarning] = useState(false)
  const textareaRef = useRef(null)

  function handleChange(e) {
    setText(e.target.value)
    // Auto-resize: reset height then set to scrollHeight
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
    if (noDocSelected) {
      setShowWarning(true)
      setTimeout(() => setShowWarning(false), 3000)
      return
    }
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const charCount = text.length

  return (
    <div className="px-6 pt-4 pb-8 relative z-10">
      <div className="max-w-2xl mx-auto">
        {showWarning && (
          <p className="text-xs text-amber-400 mb-2">⚠ Selecione um contrato primeiro</p>
        )}
        <div className="flex items-stretch gap-2">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={3}
            placeholder={
              noDocSelected
                ? 'Selecione um contrato primeiro…'
                : disabled
                ? 'Aguardando resposta…'
                : 'Pergunte sobre uma cláusula, obrigação ou termo…'
            }
            className="flex-1 resize-none rounded-xl border bg-white/[0.07] border-white/[0.12] px-3 py-2.5 text-base text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500/50 disabled:bg-white/[0.03] disabled:text-slate-600 transition-colors"
            style={{ minHeight: '150px', maxHeight: '200px', overflow: 'hidden' }}
          />
          <button
            onClick={submit}
            disabled={disabled || !text.trim()}
            className="flex-shrink-0 self-stretch flex items-center justify-center bg-gradient-to-br from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 disabled:from-slate-700 disabled:to-slate-800 disabled:text-slate-600 disabled:shadow-none text-white rounded-xl px-4 transition-all shadow-glow-indigo focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900"
            aria-label="Enviar mensagem"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-5 h-5"
            >
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          </button>
        </div>
        {charCount > 200 && (
          <p className="text-xs text-slate-600 mt-1 text-right">{charCount} caracteres</p>
        )}
      </div>
    </div>
  )
}
