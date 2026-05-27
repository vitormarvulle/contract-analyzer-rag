/**
 * Renders a single chat message bubble.
 *
 * @param {Object} props
 * @param {'user'|'assistant'} props.role - Message sender role.
 * @param {string} props.content - Message text (may contain **bold** and newlines).
 * @param {boolean} [props.isStreaming] - When true, shows a blinking cursor at the end.
 * @param {string} props.timestamp - Formatted time string (HH:MM).
 */
export default function MessageBubble({ role, content, isStreaming = false, timestamp }) {
  const isUser = role === 'user'
  const isError = content.startsWith('[ERROR]:')

  /** Convert **text** → <strong> and \n → <br /> */
  function renderContent(text) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>
      }
      return part.split('\n').map((line, j, arr) => (
        <span key={`${i}-${j}`}>
          {line}
          {j < arr.length - 1 && <br />}
        </span>
      ))
    })
  }

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[75%]">
          <div className="bg-gradient-to-br from-indigo-500 to-violet-600 text-white rounded-2xl rounded-br-sm px-4 py-3 text-base leading-relaxed shadow-glow-indigo">
            {content}
          </div>
          <p className="text-sm text-slate-500 text-right mt-1 pr-1">{timestamp}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start mb-4">
      <div className="max-w-[80%]">
        <div
          className={`rounded-2xl rounded-bl-sm px-4 py-3 text-base leading-relaxed border ${
            isError
              ? 'bg-red-950/50 border-red-800/40 text-red-300'
              : 'bg-white/[0.06] backdrop-blur-sm border-white/[0.10] text-slate-200'
          }`}
        >
          {renderContent(isError ? content.replace('[ERROR]: ', '') : content)}
          {isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
          )}
        </div>
        <p className="text-sm text-slate-600 mt-1 pl-1">{timestamp}</p>
      </div>
    </div>
  )
}
