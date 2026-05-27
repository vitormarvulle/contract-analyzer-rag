import { useState } from 'react'
import { deleteDocument } from '../api/client'

/**
 * Sidebar list of ingested documents with selection and delete controls.
 *
 * @param {Object} props
 * @param {Array<{document_id: string, filename: string}>} props.documents - All available documents.
 * @param {string|null} props.selectedId - Currently selected document_id, or null.
 * @param {(id: string|null) => void} props.onSelect - Called when user selects a document.
 * @param {(id: string) => void} props.onDelete - Called after a document is deleted.
 * @param {boolean} [props.disabled] - Disable interactions while streaming.
 */
export default function DocumentSelector({ documents, selectedId, onSelect, onDelete, disabled = false }) {
  const [deletingId, setDeletingId] = useState(null)

  async function handleDelete(e, docId) {
    e.stopPropagation()
    if (disabled || deletingId) return
    setDeletingId(docId)
    try {
      await deleteDocument(docId)
      if (selectedId === docId) onSelect(null)
      onDelete(docId)
    } catch (err) {
      console.error('Delete failed:', err)
    } finally {
      setDeletingId(null)
    }
  }

  if (documents.length === 0) {
    return (
      <div className="px-4 pb-4">
        <p className="text-xs text-slate-500 text-center py-3">Nenhum contrato enviado ainda.</p>
      </div>
    )
  }

  return (
    <div className="px-4 pb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Contratos
        </span>
        <span className="text-xs text-indigo-400 bg-indigo-950/60 rounded-full px-2 py-0.5 border border-indigo-800/40">
          {documents.length}
        </span>
      </div>

      <ul className="space-y-1">
        {documents.map((doc) => {
          const isSelected = doc.document_id === selectedId
          const isDeleting = doc.document_id === deletingId

          return (
            <li key={doc.document_id}>
              <button
                onClick={() => !disabled && onSelect(isSelected ? null : doc.document_id)}
                disabled={disabled}
                className={`group w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  isSelected
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-glow-indigo'
                    : 'text-slate-400 hover:bg-white/[0.07] hover:text-slate-200 disabled:opacity-50'
                }`}
              >
                {/* File icon */}
                <svg
                  className={`flex-shrink-0 w-4 h-4 ${isSelected ? 'text-indigo-100' : 'text-slate-600'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  />
                </svg>

                <span className="flex-1 truncate" title={doc.filename}>
                  {doc.filename}
                </span>

                {/* Delete button */}
                {!isDeleting ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => handleDelete(e, doc.document_id)}
                    onKeyDown={(e) => e.key === 'Enter' && handleDelete(e, doc.document_id)}
                    className={`flex-shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 rounded transition-opacity ${
                      isSelected
                        ? 'hover:bg-violet-500/40 text-indigo-200'
                        : 'hover:bg-white/[0.10] text-slate-500'
                    }`}
                    aria-label={`Delete ${doc.filename}`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </span>
                ) : (
                  <svg
                    className="flex-shrink-0 w-3.5 h-3.5 animate-spin text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
