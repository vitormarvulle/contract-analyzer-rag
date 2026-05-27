"""PDF extraction, text chunking, and ingestion into the vector store."""

import hashlib
import logging
from typing import List

import fitz  # PyMuPDF
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from config import settings
from models import UploadResponse
from vectorstore import add_documents, document_exists

logger = logging.getLogger(__name__)

_splitter = RecursiveCharacterTextSplitter(
    separators=[
        "\n\nArtigo",
        "\n\nCláusula",
        "\n\nClause",
        "\n\nArticle",
        "\n\n",
        "\n",
        ". ",
        " ",
    ],
    chunk_size=settings.CHUNK_SIZE,
    chunk_overlap=settings.CHUNK_OVERLAP,
    length_function=len,
)


def _compute_document_id(filename: str, file_size: int) -> str:
    """Generate a deterministic 16-hex-char document identifier."""
    raw = f"{filename}{file_size}".encode()
    return hashlib.sha256(raw).hexdigest()[:16]


def _extract_text(pdf_bytes: bytes) -> tuple[str, int]:
    """Extract concatenated plain text and page count from PDF bytes."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages = [page.get_text() for page in doc]
    full_text = "\n".join(pages)
    page_count = doc.page_count
    doc.close()
    return full_text, page_count


def ingest_pdf(filename: str, pdf_bytes: bytes) -> UploadResponse:
    """
    Full ingestion pipeline for a single PDF file.

    Steps:
    1. Compute deterministic document_id.
    2. Check if already indexed (idempotent — skip embedding if so).
    3. Extract text via PyMuPDF.
    4. Split into chunks with legal-document-aware separators.
    5. Embed and persist to ChromaDB.

    Returns an UploadResponse with chunk_count and already_existed flag.
    """
    file_size = len(pdf_bytes)
    document_id = _compute_document_id(filename, file_size)

    logger.info("Ingesting '%s' (size=%d bytes, id='%s').", filename, file_size, document_id)

    if document_exists(document_id):
        logger.info("Document '%s' already indexed — skipping re-embedding.", document_id)
        # Return chunk_count=0 as we skip counting existing chunks to avoid a full scan.
        # The frontend treats already_existed=True as an info banner, not an error.
        return UploadResponse(
            document_id=document_id,
            filename=filename,
            chunk_count=0,
            already_existed=True,
        )

    full_text, page_count = _extract_text(pdf_bytes)
    logger.info("Extracted %d pages from '%s'.", page_count, filename)

    raw_chunks: List[str] = _splitter.split_text(full_text)
    total_chunks = len(raw_chunks)
    logger.info("Split '%s' into %d chunks.", filename, total_chunks)

    docs: List[Document] = [
        Document(
            page_content=chunk,
            metadata={
                "document_id": document_id,
                "filename": filename,
                "chunk_index": i,
                "total_chunks": total_chunks,
            },
        )
        for i, chunk in enumerate(raw_chunks)
    ]

    add_documents(docs)
    logger.info("Ingestion complete for '%s': %d chunks stored.", filename, total_chunks)

    return UploadResponse(
        document_id=document_id,
        filename=filename,
        chunk_count=total_chunks,
        already_existed=False,
    )
