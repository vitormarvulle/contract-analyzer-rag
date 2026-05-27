import { useEffect, useRef, useState } from 'react'
import { streamChat } from '../api/client'
import ChatInput from './ChatInput'
import MessageBubble from './MessageBubble'
import logo from '../logo-contract-analyzer.png'

// Characters revealed per interval tick — raise to go faster, lower to go slower.
const TYPEWRITER_CHARS_PER_TICK = 3
const TYPEWRITER_INTERVAL_MS = 8

/**
 * Main chat pane — manages message list, calls the streaming API, and auto-scrolls.
 *
 * @param {Object} props
 * @param {string|null} props.selectedDocumentId - Currently selected document, or null.
 * @param {(streaming: boolean) => void} [props.onStreamingChange] - Notifies parent of streaming state.
 */
export default function Chat({ selectedDocumentId, onStreamingChange }) {
  const [messages, setMessages] = useState([])
  const [isStreaming, setIsStreaming] = useState(false)
  const bottomRef = useRef(null)
  const intervalRef = useRef(null)
  const bufferRef = useRef('')

  function setStreaming(val) {
    setIsStreaming(val)
    onStreamingChange?.(val)
  }

  // Clean up animation interval on unmount
  useEffect(() => () => clearInterval(intervalRef.current), [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages.length])

  function formatTime(date) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  function startTypewriter(fullText) {
    let pos = 0
    clearInterval(intervalRef.current)

    intervalRef.current = setInterval(() => {
      pos = Math.min(pos + TYPEWRITER_CHARS_PER_TICK, fullText.length)
      const slice = fullText.slice(0, pos)
      const done = pos >= fullText.length

      setMessages((prev) => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: slice,
          isStreaming: !done,
        }
        return updated
      })

      if (done) {
        clearInterval(intervalRef.current)
        setStreaming(false)
      }
    }, TYPEWRITER_INTERVAL_MS)
  }

  async function handleSend(question) {
    if (!selectedDocumentId || isStreaming) return

    bufferRef.current = ''

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: question,
      timestamp: formatTime(new Date()),
    }

    const assistantMessage = {
      id: Date.now() + 1,
      role: 'assistant',
      content: '',
      isStreaming: true,
      timestamp: formatTime(new Date()),
    }

    setMessages((prev) => [...prev, userMessage, assistantMessage])
    setStreaming(true)

    await streamChat(
      question,
      selectedDocumentId,
      // onChunk — silently buffer; three dots stay visible
      (token) => { bufferRef.current += token },
      // onDone — full text received, start fast local typewriter
      () => { startTypewriter(bufferRef.current) },
      // onError
      (err) => {
        clearInterval(intervalRef.current)
        setMessages((prev) => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: `[ERROR]: ${err.message}`,
            isStreaming: false,
          }
          return updated
        })
        setStreaming(false)
      },
    )
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-4 chat-scroll relative z-10">
        {isEmpty ? (
          <div className="h-full flex flex-col items-center justify-center text-center select-none px-8">
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-full blur-2xl bg-indigo-500/20 scale-150" />
              <img src={logo} alt="Contract Analyzer" className="relative w-30 h-30 object-contain drop-shadow-[0_0_18px_rgba(99,102,241,0.6)]" />
            </div>
            <img
              src="https://readme-typing-svg.herokuapp.com?font=Fira+Code&pause=1000&color=6366F1&center=true&width=500&lines=Converse+com+seus+contratos...;Envie.+Pergunte.+Entenda.;An%C3%A1lise+sem%C3%A2ntica+com+RAG;Extraia+insights+de+documentos+jur%C3%ADdicos;LLM+local%2C+zero+depend%C3%AAncia+de+nuvem"
              alt="Contract Analyzer taglines"
              className="mb-0 h-10"
              draggable={false}
            />
            <p className="text-slate-500 max-w-xs text-sm leading-relaxed mb-8">
              Faça upload de um contrato na barra lateral, selecione-o e pergunte qualquer coisa sobre suas cláusulas, obrigações ou termos.
            </p>
            <div className="flex items-center gap-2 text-indigo-400/70 text-xs animate-pulse">
              <svg className="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
              <span>Comece fazendo upload de um PDF</span>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              if (msg.role === 'assistant' && msg.isStreaming && msg.content === '') return null
              return (
                <MessageBubble
                  key={msg.id}
                  role={msg.role}
                  content={msg.content || ''}
                  isStreaming={msg.isStreaming}
                  timestamp={msg.timestamp}
                />
              )
            })}

            {/* Three dots: only while LLM is generating (buffer still empty) */}
            {isStreaming && messages.at(-1)?.content === '' && (
              <div className="flex justify-start mb-4">
                <div className="bg-white/[0.06] backdrop-blur-sm border border-white/[0.10] rounded-2xl rounded-bl-sm px-4 py-3">
                  <span className="flex gap-1">
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </>
        )}
      </div>

      <ChatInput
        onSend={handleSend}
        disabled={isStreaming}
        noDocSelected={!selectedDocumentId}
      />
    </div>
  )
}
