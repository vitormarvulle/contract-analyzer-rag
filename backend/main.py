"""FastAPI application — all HTTP routes for Contract Analyzer."""

import asyncio
import logging
from typing import List

import httpx
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse

from config import settings
from ingest import ingest_pdf
from models import ChatRequest, DocumentInfo, HealthResponse, UploadResponse
from rag import stream_rag_response
from vectorstore import delete_document, list_documents

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Contract Analyzer API",
    version="1.0.0",
    description="RAG backend for PDF contract analysis using local LLMs.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup() -> None:
    """Log loaded configuration on startup."""
    logger.info("=== Contract Analyzer starting ===")
    logger.info("OLLAMA_BASE_URL      = %s", settings.OLLAMA_BASE_URL)
    logger.info("OLLAMA_MODEL         = %s", settings.OLLAMA_MODEL)
    logger.info("EMBEDDING_MODEL_NAME = %s", settings.EMBEDDING_MODEL_NAME)
    logger.info("EMBEDDING_DEVICE     = %s", settings.EMBEDDING_DEVICE)
    logger.info("CHROMA_PERSIST_DIR   = %s", settings.CHROMA_PERSIST_DIR)
    logger.info("CHUNK_SIZE           = %d", settings.CHUNK_SIZE)
    logger.info("CHUNK_OVERLAP        = %d", settings.CHUNK_OVERLAP)
    logger.info("TOP_K_RESULTS        = %d", settings.TOP_K_RESULTS)
    logger.info("=== Startup complete ===")


@app.get("/health", response_model=HealthResponse, summary="System health check")
async def health() -> HealthResponse:
    """Ping Ollama and report embedding model load status."""
    ollama_ok = False
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            # Ollama's native /api/tags endpoint lists available models.
            base = settings.OLLAMA_BASE_URL.replace("/v1", "")
            resp = await client.get(f"{base}/api/tags")
            ollama_ok = resp.status_code == 200
    except Exception as exc:
        logger.warning("Ollama unreachable: %s", exc)

    from embeddings import embedding_model as _em
    embedding_loaded = _em is not None

    overall = "ok" if (ollama_ok and embedding_loaded) else "degraded"
    return HealthResponse(
        status=overall,
        ollama_reachable=ollama_ok,
        embedding_model_loaded=embedding_loaded,
    )


@app.post("/api/upload", response_model=UploadResponse, summary="Upload and ingest a PDF contract")
async def upload_document(file: UploadFile) -> UploadResponse:
    """
    Accept a PDF file upload, extract text, chunk it, embed with BGE-M3,
    and persist to ChromaDB. Idempotent — re-uploading the same file is a no-op.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted (check file extension).")

    content_type = file.content_type or ""
    if "pdf" not in content_type.lower() and content_type != "application/octet-stream":
        raise HTTPException(
            status_code=400,
            detail=f"Invalid content type '{content_type}'. Expected application/pdf.",
        )

    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    loop = asyncio.get_event_loop()
    result: UploadResponse = await loop.run_in_executor(
        None,
        ingest_pdf,
        file.filename,
        pdf_bytes,
    )
    return result


@app.get("/api/documents", response_model=List[DocumentInfo], summary="List all ingested documents")
async def get_documents() -> List[DocumentInfo]:
    """Return the list of unique documents stored in the vector store."""
    return list_documents()


@app.delete("/api/documents/{document_id}", summary="Delete a document from the vector store")
async def remove_document(document_id: str) -> dict:
    """Remove all chunks belonging to document_id from ChromaDB."""
    count = delete_document(document_id)
    if count == 0:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found.")
    return {"deleted_chunks": count, "document_id": document_id}


@app.post("/api/chat", summary="Stream a RAG chat response via SSE")
async def chat(request: ChatRequest) -> StreamingResponse:
    """
    Accept a question and document_id, retrieve relevant chunks from ChromaDB,
    and stream the LLM answer as Server-Sent Events.

    Each SSE event is formatted as: `data: {token_text}\\n\\n`
    The stream ends with: `data: [DONE]\\n\\n`
    """
    logger.info("Chat request: doc='%s' question='%s…'", request.document_id, request.question[:60])

    async def event_generator():
        """Wrap the RAG async generator as an SSE stream."""
        async for token in stream_rag_response(request.question, request.document_id):
            yield f"data: {token}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/viz", response_class=HTMLResponse, summary="3D embedding visualisation")
async def viz() -> HTMLResponse:
    """
    Generate and return a self-contained Plotly 3D scatter HTML page.
    Opens directly in the browser — no extra dependencies required.
    """
    import numpy as np
    import plotly.graph_objects as go
    from sklearn.decomposition import PCA

    from vectorstore import _chroma_client

    collection = _chroma_client.get_collection("contracts")
    result = collection.get(include=["embeddings", "metadatas", "documents"])
    embeddings = result.get("embeddings") or []
    metadatas  = result.get("metadatas")  or []
    documents  = result.get("documents")  or []

    if len(embeddings) < 3:
        return HTMLResponse(
            "<html><body style='background:#13131f;color:white;font-family:sans-serif;"
            "display:flex;align-items:center;justify-content:center;height:100vh;margin:0'>"
            "<p>Not enough chunks to visualise yet. Upload at least one PDF first.</p></body></html>"
        )

    loop = asyncio.get_event_loop()
    X = np.array(embeddings)
    coords = await loop.run_in_executor(None, lambda: PCA(n_components=3).fit_transform(X))

    filenames     = [m.get("filename", "unknown") for m in metadatas]
    chunk_indices = [m.get("chunk_index", "?")    for m in metadatas]
    unique_files  = sorted(set(filenames))

    COLOURS = [
        "#6366f1", "#f59e0b", "#10b981", "#ef4444",
        "#3b82f6", "#ec4899", "#14b8a6", "#f97316",
    ]

    def _wrap(text: str, width: int = 55) -> str:
        """Break long text into lines of at most `width` chars for the hover box."""
        words, lines, current = text.split(), [], ""
        for word in words:
            if len(current) + len(word) + 1 > width and current:
                lines.append(current)
                current = word
            else:
                current = (current + " " + word).strip()
        if current:
            lines.append(current)
        return "<br>".join(lines)

    traces = []
    for i, fname in enumerate(unique_files):
        mask = [j for j, fn in enumerate(filenames) if fn == fname]
        hover = [
            f"<b>{fname}</b><br>chunk {chunk_indices[j]}<br>─────────────────────<br>"
            + _wrap(documents[j][:220].replace("\n", " "))
            + ("…" if len(documents[j]) > 220 else "")
            for j in mask
        ]
        traces.append(go.Scatter3d(
            x=coords[mask, 0],
            y=coords[mask, 1],
            z=coords[mask, 2],
            mode="markers",
            name=fname,
            marker=dict(size=7, color=COLOURS[i % len(COLOURS)], opacity=0.85,
                        line=dict(width=0.5, color="white")),
            text=hover,
            hovertemplate="%{text}<extra></extra>",
            hoverlabel=dict(
                bgcolor="#2a2a3e",
                bordercolor=COLOURS[i % len(COLOURS)],
                font=dict(size=12, color="white", family="monospace"),
                align="left",
                namelength=0,
            ),
        ))

    fig = go.Figure(data=traces)
    fig.update_layout(
        title=dict(text="Chunk Embeddings — 3D PCA", font=dict(size=18)),
        scene=dict(
            xaxis=dict(title="PC 1", backgroundcolor="#1e1e2e", gridcolor="#333"),
            yaxis=dict(title="PC 2", backgroundcolor="#1e1e2e", gridcolor="#333"),
            zaxis=dict(title="PC 3", backgroundcolor="#1e1e2e", gridcolor="#333"),
            bgcolor="#1e1e2e",
        ),
        paper_bgcolor="#13131f",
        font=dict(color="white"),
        legend=dict(title="Documents", bgcolor="#2a2a3e", bordercolor="#444", borderwidth=1),
        margin=dict(l=0, r=0, b=0, t=50),
    )

    html = fig.to_html(full_html=True, include_plotlyjs=True)
    logger.info("Served /api/viz — %d chunks, %d documents.", len(embeddings), len(unique_files))
    return HTMLResponse(content=html)
