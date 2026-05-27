"""LangChain-compatible embedding class backed by BAAI/bge-m3 via sentence-transformers."""

import asyncio
import logging
from functools import lru_cache, partial
from typing import List

from langchain_core.embeddings import Embeddings
from sentence_transformers import SentenceTransformer

from config import settings

logger = logging.getLogger(__name__)

BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: "


class BGEM3Embeddings(Embeddings):
    """
    LangChain Embeddings subclass wrapping BAAI/bge-m3 via sentence-transformers.
    Runs fully locally on CPU or GPU. The underlying model is loaded once and
    reused across all requests.
    """

    def __init__(self, model_name: str = settings.EMBEDDING_MODEL_NAME, device: str = settings.EMBEDDING_DEVICE) -> None:
        """Load the SentenceTransformer model on the specified device."""
        logger.info("Loading embedding model '%s' on device '%s'…", model_name, device)
        self._model = SentenceTransformer(model_name, device=device)
        logger.info("Embedding model loaded successfully.")

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Embed a list of document texts synchronously."""
        vectors = self._model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return vectors.tolist()

    def embed_query(self, text: str) -> List[float]:
        """Embed a single query string with the BGE-M3 asymmetric retrieval prefix."""
        return self._cached_embed_query(text)

    @lru_cache(maxsize=256)
    def _cached_embed_query(self, text: str) -> List[float]:
        """LRU-cached encoding — identical queries skip the model forward pass entirely."""
        prefixed = BGE_QUERY_PREFIX + text
        vector = self._model.encode(
            prefixed,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        logger.debug("Query embedded (cache miss): '%s…'", text[:60])
        return vector.tolist()

    async def aembed_documents(self, texts: List[str]) -> List[List[float]]:
        """Async variant: offloads encoding to a thread pool to avoid blocking the event loop."""
        loop = asyncio.get_event_loop()
        encode_fn = partial(
            self._model.encode,
            texts,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        vectors = await loop.run_in_executor(None, encode_fn)
        return vectors.tolist()

    async def aembed_query(self, text: str) -> List[float]:
        """Async variant: runs _cached_embed_query in a thread pool."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._cached_embed_query, text)


# Module-level singleton — instantiated once on import to avoid repeated model loading.
embedding_model = BGEM3Embeddings()
