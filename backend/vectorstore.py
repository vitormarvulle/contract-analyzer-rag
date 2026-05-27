"""ChromaDB vector store initialisation, document persistence, and retrieval."""

import asyncio
import logging
from functools import partial
from typing import List

import chromadb
from langchain_chroma import Chroma
from langchain_core.documents import Document

from config import settings
from embeddings import embedding_model
from models import DocumentInfo

logger = logging.getLogger(__name__)

_COLLECTION_NAME = "contracts"

# Persistent Chroma client and LangChain wrapper, created once at module level.
_chroma_client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)
_vectorstore = Chroma(
    client=_chroma_client,
    collection_name=_COLLECTION_NAME,
    embedding_function=embedding_model,
)


def add_documents(docs: List[Document]) -> None:
    """Embed and persist a list of LangChain Documents into ChromaDB."""
    ids = [f"{doc.metadata['document_id']}_{doc.metadata['chunk_index']}" for doc in docs]
    _vectorstore.add_documents(documents=docs, ids=ids)
    logger.info("Stored %d chunks in collection '%s'.", len(docs), _COLLECTION_NAME)


def similarity_search(query: str, document_id: str, k: int = settings.TOP_K_RESULTS) -> List[Document]:
    """
    Return the top-k chunks most similar to query, filtered strictly to document_id.
    Uses ChromaDB's metadata $eq filter to scope results to a single document.
    CPU-bound — call via asimilarity_search inside async contexts.
    """
    results = _vectorstore.similarity_search(
        query=query,
        k=k,
        filter={"document_id": {"$eq": document_id}},
    )
    logger.info(
        "similarity_search: query='%s…' doc='%s' → %d chunks retrieved.",
        query[:50],
        document_id,
        len(results),
    )
    for i, doc in enumerate(results):
        preview = doc.page_content.replace("\n", " ")[:120]
        logger.info(
            "  [chunk %d/%d] idx=%s | %s…",
            i + 1,
            len(results),
            doc.metadata.get("chunk_index", "?"),
            preview,
        )
    return results


async def asimilarity_search(query: str, document_id: str, k: int = settings.TOP_K_RESULTS) -> List[Document]:
    """
    Async wrapper around similarity_search.
    Offloads the CPU-bound embedding + vector search to a thread pool so the
    FastAPI event loop is not blocked while BGE-M3 runs inference.
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None,
        partial(similarity_search, query, document_id, k),
    )


def list_documents() -> List[DocumentInfo]:
    """Return unique DocumentInfo objects from all stored chunk metadata."""
    collection = _chroma_client.get_collection(_COLLECTION_NAME)
    result = collection.get(include=["metadatas"])
    metadatas = result.get("metadatas") or []

    seen: dict[str, str] = {}
    for meta in metadatas:
        doc_id = meta.get("document_id")
        filename = meta.get("filename")
        if doc_id and doc_id not in seen:
            seen[doc_id] = filename

    return [DocumentInfo(document_id=doc_id, filename=fn) for doc_id, fn in seen.items()]


def document_exists(document_id: str) -> bool:
    """Return True if at least one chunk with this document_id is stored."""
    collection = _chroma_client.get_collection(_COLLECTION_NAME)
    result = collection.get(
        where={"document_id": {"$eq": document_id}},
        limit=1,
        include=[],
    )
    return len(result.get("ids", [])) > 0


def delete_document(document_id: str) -> int:
    """Delete all chunks belonging to document_id. Returns the count deleted."""
    collection = _chroma_client.get_collection(_COLLECTION_NAME)
    existing = collection.get(
        where={"document_id": {"$eq": document_id}},
        include=[],
    )
    ids_to_delete = existing.get("ids", [])
    if ids_to_delete:
        collection.delete(ids=ids_to_delete)
        logger.info("Deleted %d chunks for document_id='%s'.", len(ids_to_delete), document_id)
    return len(ids_to_delete)
