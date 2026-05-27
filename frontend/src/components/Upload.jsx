import { useRef, useState } from 'react'
import { uploadDocument } from '../api/client'

/**
 * Drag-and-drop PDF upload zone with progress and status feedback.
 *
 * @param {Object} props
 * @param {(doc: {document_id: string, filename: string, chunk_count: number, already_existed: boolean}) => void} props.onDocumentAdded
 *   Called after a successful upload with the server response.
 */
export default function Upload({ onDocumentAdded }) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [banner, setBanner] = useState(null) // { type: 'success'|'info'|'error', message: string }
  const inputRef = useRef(null)

  function showBanner(type, message, autoHide = true) {
    setBanner({ type, message })
    if (autoHide) setTimeout(() => setBanner(null), 5000)
  }

  async function processFile(file) {
    if (!file) return

    if (!file.name.toLowerCase().endsWith('.pdf') || file.type !== 'application/pdf') {
      showBanner('error', 'Apenas arquivos PDF são aceitos.')
      return
    }

    if (file.size > 50 * 1024 * 1024) {
      showBanner('error', `Arquivo tem ${(file.size / 1024 / 1024).toFixed(1)} MB — tamanho máximo é 50 MB.`)
      return
    }

    setUploading(true)
    setBanner(null)

    try {
      const doc = await uploadDocument(file)

      if (doc.already_existed) {
        showBanner('info', `ℹ Este documento já foi indexado. Selecionando agora.`)
      } else {
        showBanner(
          'success',
          `✓ ${doc.filename} enviado e indexado com sucesso (${doc.chunk_count} trechos)`,
        )
      }

      onDocumentAdded(doc)
    } catch (err) {
      showBanner('error', err.message || 'Falha no envio. Tente novamente.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function handleDrop(e) {
    e.preventDefault()
    setIsDragging(false)
    processFile(e.dataTransfer.files[0])
  }

  function handleDragOver(e) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave() {
    setIsDragging(false)
  }

  function handleFileInput(e) {
    processFile(e.target.files[0])
  }

  const bannerClasses = {
    success: 'bg-emerald-900 text-emerald-200 border-emerald-700',
    info: 'bg-blue-900 text-blue-200 border-blue-700',
    error: 'bg-red-900 text-red-200 border-red-700',
  }

  return (
    <div className="px-4 pb-4">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-indigo-400 bg-indigo-900/30'
            : 'border-slate-600 hover:border-slate-400 hover:bg-slate-800/50'
        } ${uploading ? 'pointer-events-none opacity-70' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileInput}
          className="hidden"
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-2 py-1">
            <svg
              className="animate-spin h-6 w-6 text-indigo-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              />
            </svg>
            <p className="text-xs text-slate-300">Processando e indexando…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 py-1">
            <svg
              className="w-6 h-6 text-slate-400 mb-1"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            <p className="text-xs text-slate-300 font-medium">Solte o PDF aqui</p>
            <p className="text-xs text-slate-500">ou clique para selecionar (máx. 50 MB)</p>
          </div>
        )}
      </div>

      {/* Status banner */}
      {banner && (
        <div
          className={`mt-2 px-3 py-2 rounded-lg text-xs border ${bannerClasses[banner.type]}`}
        >
          {banner.message}
        </div>
      )}
    </div>
  )
}
