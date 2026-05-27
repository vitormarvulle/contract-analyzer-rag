# Contract Analyzer

A fully local RAG (Retrieval-Augmented Generation) application for analyzing PDF contracts. Upload any PDF, then chat with a local LLM to extract and explain clauses — no external API keys required.

---

## Architecture

```
PDF File
   │
   ▼
FastAPI /api/upload
   │
   ├── PyMuPDF (text extraction)
   ├── RecursiveCharacterTextSplitter (chunking)
   ├── BAAI/bge-m3 via sentence-transformers (embeddings)  ← runs locally
   └── ChromaDB (vector persistence)

User Question
   │
   ▼
FastAPI /api/chat
   ├── BAAI/bge-m3 (embed query) + metadata filter by document_id
   ├── ChromaDB similarity search → top-K chunks
   ├── Prompt builder (system + context + question)
   └── Ollama llama3.1:8b (streaming response)  ← runs locally
          │
          ▼
      React SSE Consumer → Chat UI
```

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Python | 3.11+ | Backend runtime |
| Node.js | 18+ | Frontend build |
| Ollama | Latest | Local LLM server |
| RAM | 8 GB+ | 4 GB for LLM + 2 GB for embeddings |
| Disk | ~7 GB | llama3.1:8b (~4.7 GB) + bge-m3 (~2.3 GB) |

---

## Ollama Setup

```bash
# Install Ollama (Linux/macOS)
curl -fsSL https://ollama.com/install.sh | sh

# Pull the LLM model (~4.7 GB download)
ollama pull llama3.1:8b

# Ollama starts automatically as a background service.
# Verify it is running: http://localhost:11434
```

---

## Backend Setup

```bash
cd contract-analyzer/backend

# Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate        # macOS/Linux
# .venv\Scripts\activate         # Windows

# (Optional) Install CPU-only PyTorch first for a faster install
pip install torch --index-url https://download.pytorch.org/whl/cpu

# Install all dependencies
pip install -r requirements.txt

# Copy and edit the environment file (all defaults work out of the box)
cp .env.example .env

# Start the development server
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.  
On first startup, `BAAI/bge-m3` (~2.3 GB) downloads automatically to `~/.cache/huggingface/`.

---

## Frontend Setup

```bash
cd contract-analyzer/frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

The UI will be available at `http://localhost:5173`.

To build for production:

```bash
npm run build    # output in frontend/dist/
npm run preview  # serve the production build locally
```

---

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | System health — Ollama reachability + embedding model status |
| `POST` | `/api/upload` | Upload a PDF for ingestion (multipart/form-data, field: `file`) |
| `GET` | `/api/documents` | List all ingested documents |
| `DELETE` | `/api/documents/{document_id}` | Remove a document from the vector store |
| `POST` | `/api/chat` | Stream a RAG answer as SSE (`{question, document_id}`) |

### Example: upload a PDF

```bash
curl -X POST http://localhost:8000/api/upload \
  -F "file=@contract.pdf"
```

### Example: chat (streaming)

```bash
curl -N -X POST http://localhost:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "What are the termination clauses?", "document_id": "abc123def456"}'
```

---

## How RAG Works

When you upload a PDF, the text is extracted and split into overlapping chunks. Each chunk is converted into a vector (a list of numbers) by the `BAAI/bge-m3` embedding model and stored in ChromaDB alongside metadata identifying which document the chunk belongs to.

When you ask a question, the question is also embedded into the same vector space. ChromaDB finds the chunks whose vectors are most similar to the question vector — these are the most semantically relevant sections of the contract. Those chunks are injected into the prompt sent to the Ollama LLM, which generates an answer grounded exclusively in that context. This prevents hallucination and keeps answers scoped to the selected document.

---

## Switching LLM Models

Edit `backend/.env` and change `OLLAMA_MODEL`. Then restart the backend server.

```bash
# Some alternatives (first pull the model with Ollama):
ollama pull mistral
ollama pull gemma3
ollama pull deepseek-r1
ollama pull phi3

# Then in .env:
OLLAMA_MODEL=mistral
```

---

## Hardware Notes

**CPU-only (default):**
- Embedding a 10-page contract takes ~5–30 seconds depending on CPU speed.
- LLM response starts in 2–10 seconds; token generation is ~5–15 tokens/sec.

**GPU acceleration:**
- Set `EMBEDDING_DEVICE=cuda` (NVIDIA) or `EMBEDDING_DEVICE=mps` (Apple Silicon) in `.env`.
- Embedding time drops to under 1 second.
- For LLM GPU acceleration, Ollama handles this automatically when a compatible GPU is detected.

**Memory:**
- `llama3.1:8b` requires ~4.7 GB VRAM (GPU) or RAM (CPU).
- `BAAI/bge-m3` requires ~2 GB RAM during embedding.

---

## Project Structure

```
contract-analyzer/
├── backend/
│   ├── main.py          # FastAPI routes
│   ├── rag.py           # Retrieval + streaming LLM pipeline
│   ├── vectorstore.py   # ChromaDB read/write
│   ├── ingest.py        # PDF → chunks → embeddings
│   ├── embeddings.py    # BAAI/bge-m3 LangChain wrapper
│   ├── models.py        # Pydantic schemas
│   ├── config.py        # Environment-based settings
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.jsx
    │   ├── components/
    │   │   ├── Chat.jsx
    │   │   ├── ChatInput.jsx
    │   │   ├── MessageBubble.jsx
    │   │   ├── Upload.jsx
    │   │   └── DocumentSelector.jsx
    │   └── api/
    │       └── client.js
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── tailwind.config.js
```
