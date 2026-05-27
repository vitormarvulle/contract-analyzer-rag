import { useEffect, useState } from 'react'
import { getDocuments, getHealth } from './api/client'
import Chat from './components/Chat'
import DocumentSelector from './components/DocumentSelector'
import Upload from './components/Upload'

export default function App() {
  const [documents, setDocuments] = useState([])
  const [selectedDocumentId, setSelectedDocumentId] = useState(null)
  const [healthStatus, setHealthStatus] = useState(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    getHealth()
      .then(setHealthStatus)
      .catch(() => setHealthStatus({ status: 'degraded', ollama_reachable: false, embedding_model_loaded: false }))

    getDocuments()
      .then(setDocuments)
      .catch(console.error)
  }, [])

  function handleDocumentAdded(doc) {
    setDocuments((prev) => {
      const exists = prev.some((d) => d.document_id === doc.document_id)
      return exists ? prev : [...prev, { document_id: doc.document_id, filename: doc.filename }]
    })
    setSelectedDocumentId(doc.document_id)
  }

  function handleDocumentDeleted(docId) {
    setDocuments((prev) => prev.filter((d) => d.document_id !== docId))
  }

  const ollamaDown = healthStatus && !healthStatus.ollama_reachable

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950 font-sans">
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside
        className={`${
          sidebarOpen ? 'flex' : 'hidden'
        } md:flex flex-col w-[300px] flex-shrink-0 bg-slate-950 border-r border-white/[0.06] overflow-y-auto`}
      >
        {/* App header */}
        <div className="px-4 pt-5 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-bold tracking-tight">
              <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">Contract Analyzer</span>
            </h1>
            {/* Health dot */}
            <span
              title={healthStatus ? `Ollama: ${healthStatus.ollama_reachable ? 'online' : 'offline'}` : 'Checking…'}
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                healthStatus === null
                  ? 'bg-slate-500'
                  : healthStatus.ollama_reachable
                  ? 'bg-emerald-400'
                  : 'bg-red-500'
              }`}
            />
          </div>
          <p className="text-xs text-slate-600 mt-1">RAG Local · BAAI/bge-m3 · llama3.1:8b</p>
        </div>

        {/* Upload */}
        <div className="pt-4">
          <p className="px-4 pb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Enviar
          </p>
          <Upload onDocumentAdded={handleDocumentAdded} />
        </div>

        {/* Document list */}
        <div className="flex-1">
          <DocumentSelector
            documents={documents}
            selectedId={selectedDocumentId}
            onSelect={setSelectedDocumentId}
            onDelete={handleDocumentDeleted}
            disabled={isStreaming}
          />
        </div>

        {/* Visualise embeddings button */}
        {documents.length > 0 && (
          <div className="px-4 pb-5 pt-2 border-t border-white/[0.06]">
            <button
              onClick={() => window.open('/api/viz', '_blank')}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 bg-white/[0.05] hover:bg-white/[0.08] hover:text-white border border-white/[0.08] transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
              </svg>
              Visualizar Embeddings
            </button>
          </div>
        )}
      </aside>

      {/* ── Main area ───────────────────────────────────────────────── */}
      <main className="flex flex-col flex-1 overflow-hidden bg-gray-900 chat-bg">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] bg-gray-900">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="Toggle sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-slate-200">Contract Analyzer ⚖️</span>
        </div>

        {/* Ollama warning banner */}
        {ollamaDown && (
          <div className="bg-amber-950/60 border-b border-amber-800/40 px-4 py-2.5 text-xs text-amber-300 flex items-center gap-2">
            <svg className="w-4 h-4 flex-shrink-0 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span>
              <strong>Ollama inacessível.</strong> Verifique se está rodando em{' '}
              <code className="bg-amber-900/50 px-1 rounded text-amber-200">localhost:11434</code> e se o modelo{' '}
              <code className="bg-amber-900/50 px-1 rounded text-amber-200">llama3.1:8b</code> foi baixado.
            </span>
          </div>
        )}

        {/* Chat */}
        <Chat
          selectedDocumentId={selectedDocumentId}
          onStreamingChange={setIsStreaming}
        />
      </main>
    </div>
  )
}
