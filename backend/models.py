"""Pydantic request/response schemas for the Contract Analyzer API."""

from pydantic import BaseModel


class UploadResponse(BaseModel):
    """Response returned after a PDF is ingested."""

    document_id: str
    filename: str
    chunk_count: int
    already_existed: bool


class DocumentInfo(BaseModel):
    """Minimal document descriptor returned by the documents listing endpoint."""

    document_id: str
    filename: str


class ChatRequest(BaseModel):
    """Body for a chat completion request scoped to a single document."""

    question: str
    document_id: str


class HealthResponse(BaseModel):
    """System health report returned by GET /health."""

    status: str
    ollama_reachable: bool
    embedding_model_loaded: bool
