/**
 * HTTP client for the Contract Analyzer backend API.
 * All calls use relative paths so the Vite proxy handles backend routing.
 */

const API_BASE = '/api'

/**
 * Fetch the system health status.
 * @returns {Promise<{status: string, ollama_reachable: boolean, embedding_model_loaded: boolean}>}
 */
export async function getHealth() {
  try {
    const res = await fetch('/health')
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`)
    return await res.json()
  } catch (err) {
    console.error('[client] getHealth error:', err)
    throw err
  }
}

/**
 * Upload a PDF file for ingestion and embedding.
 * @param {File} file - The PDF file to upload.
 * @returns {Promise<{document_id: string, filename: string, chunk_count: number, already_existed: boolean}>}
 */
export async function uploadDocument(file) {
  try {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) {
      const detail = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(detail.detail || `Upload failed: ${res.status}`)
    }
    return await res.json()
  } catch (err) {
    console.error('[client] uploadDocument error:', err)
    throw err
  }
}

/**
 * Retrieve the list of all ingested documents.
 * @returns {Promise<Array<{document_id: string, filename: string}>>}
 */
export async function getDocuments() {
  try {
    const res = await fetch(`${API_BASE}/documents`)
    if (!res.ok) throw new Error(`Failed to list documents: ${res.status}`)
    return await res.json()
  } catch (err) {
    console.error('[client] getDocuments error:', err)
    throw err
  }
}

/**
 * Delete a document and all its chunks from the vector store.
 * @param {string} documentId
 * @returns {Promise<{deleted_chunks: number, document_id: string}>}
 */
export async function deleteDocument(documentId) {
  try {
    const res = await fetch(`${API_BASE}/documents/${documentId}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Delete failed: ${res.status}`)
    return await res.json()
  } catch (err) {
    console.error('[client] deleteDocument error:', err)
    throw err
  }
}

/**
 * Stream a RAG chat response via Server-Sent Events.
 *
 * Uses native fetch + ReadableStream because EventSource only supports GET,
 * but the chat endpoint requires a POST body.
 *
 * @param {string} question - The user's question.
 * @param {string} documentId - The document to scope the retrieval to.
 * @param {(token: string) => void} onChunk - Called with each streamed text token.
 * @param {() => void} onDone - Called when the stream ends cleanly.
 * @param {(err: Error) => void} onError - Called on network or parse errors.
 */
export async function streamChat(question, documentId, onChunk, onDone, onError) {
  try {
    const res = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, document_id: documentId }),
    })

    if (!res.ok) {
      const detail = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(detail.detail || `Chat request failed: ${res.status}`)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // Keep the last incomplete line in the buffer.
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const token = line.slice(6)
        if (token === '[DONE]') {
          onDone()
          return
        }
        onChunk(token)
      }
    }

    // Stream ended without [DONE] sentinel (e.g. connection dropped).
    onDone()
  } catch (err) {
    console.error('[client] streamChat error:', err)
    onError(err)
  }
}
