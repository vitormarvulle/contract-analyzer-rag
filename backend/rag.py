"""LangChain RAG pipeline: retrieval, prompt assembly, and streaming LLM response."""

import logging
from typing import AsyncGenerator

from openai import AsyncOpenAI

from config import settings
from vectorstore import asimilarity_search

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are a legal contract analyst assistant. Your role is to help users understand \
contract clauses in plain, simple language.

Rules you MUST follow:
- Answer ONLY based on the context provided below. Do not use prior knowledge.
- If the answer is not in the context, say: "I could not find this information in the selected contract."
- Never fabricate clauses, dates, parties, or legal obligations.
- When explaining clauses, use clear and simple language accessible to non-lawyers.
- Always cite which part of the contract you are referencing (e.g., "According to the clause about...").
- If asked in Portuguese, answer in Portuguese. Match the user's language.\
"""

_ollama_client = AsyncOpenAI(
    base_url=settings.OLLAMA_BASE_URL,
    api_key=settings.OLLAMA_API_KEY,
)


def _build_user_message(question: str, chunks: list) -> str:
    """Assemble the user turn with numbered context chunks followed by the question."""
    context_lines = []
    for i, doc in enumerate(chunks, start=1):
        context_lines.append(f"[Chunk {i}]:\n{doc.page_content}")

    context_block = "\n\n".join(context_lines)
    return (
        f"Context from the contract (use ONLY this to answer):\n\n"
        f"{context_block}\n\n"
        f"User question: {question}"
    )


async def stream_rag_response(question: str, document_id: str) -> AsyncGenerator[str, None]:
    """
    Async generator that yields LLM response tokens for a RAG query.

    Flow:
    1. Retrieve top-k chunks from ChromaDB filtered by document_id.
    2. If no chunks found, yield an error message and return.
    3. Build system + user messages with injected context.
    4. Stream tokens from Ollama via OpenAI-compatible API.
    5. Yield '[DONE]' as the final sentinel so the frontend can close the stream.
    """
    logger.info("RAG query: doc='%s' question='%s…'", document_id, question[:60])

    chunks = await asimilarity_search(question, document_id, k=settings.TOP_K_RESULTS)

    if not chunks:
        logger.warning("No context found for document_id='%s'.", document_id)
        yield "[ERROR]: No document context found for the selected file. Please re-upload the contract and try again."
        yield "[DONE]"
        return

    user_message = _build_user_message(question, chunks)

    try:
        stream = await _ollama_client.chat.completions.create(
            model=settings.OLLAMA_MODEL,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            stream=True,
            temperature=0.1,
        )

        async for chunk in stream:
            delta_content = chunk.choices[0].delta.content
            if delta_content is not None:
                yield delta_content

    except Exception as exc:
        logger.error("Ollama streaming error: %s", exc, exc_info=True)
        yield f"[ERROR]: Failed to get a response from the language model. Details: {exc}"

    yield "[DONE]"
