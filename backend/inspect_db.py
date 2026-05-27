"""
inspect_db.py — Interactive ChromaDB inspector.

Usage (from the backend/ directory with .venv activated):
    python inspect_db.py               # summary table of all documents
    python inspect_db.py chunks        # all chunks with text preview
    python inspect_db.py chunks <doc_id>  # chunks for a specific document
    python inspect_db.py embeddings    # embedding vectors (truncated)
    python inspect_db.py stats         # collection statistics
"""

import sys

import chromadb
from rich.console import Console
from rich.table import Table
from rich import box

from config import settings

console = Console()
client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)

try:
    collection = client.get_collection("contracts")
except Exception:
    console.print("[red]Collection 'contracts' not found. Have you uploaded any PDFs yet?[/red]")
    sys.exit(1)


def cmd_summary():
    """Show one row per unique document with chunk count."""
    result = collection.get(include=["metadatas"])
    metadatas = result.get("metadatas") or []

    docs: dict[str, dict] = {}
    for meta in metadatas:
        doc_id = meta.get("document_id", "?")
        if doc_id not in docs:
            docs[doc_id] = {"filename": meta.get("filename", "?"), "chunks": 0}
        docs[doc_id]["chunks"] += 1

    table = Table(title="Ingested Documents", box=box.ROUNDED, show_lines=True)
    table.add_column("document_id", style="cyan", no_wrap=True)
    table.add_column("filename", style="green")
    table.add_column("chunks", justify="right", style="yellow")

    for doc_id, info in docs.items():
        table.add_row(doc_id, info["filename"], str(info["chunks"]))

    console.print(table)
    console.print(f"\n[bold]Total chunks in collection:[/bold] {len(metadatas)}")


def cmd_chunks(filter_doc_id: str | None = None):
    """Show all chunks with a text preview and metadata."""
    where = {"document_id": {"$eq": filter_doc_id}} if filter_doc_id else None
    result = collection.get(
        where=where,
        include=["documents", "metadatas"],
    )

    ids = result.get("ids") or []
    documents = result.get("documents") or []
    metadatas = result.get("metadatas") or []

    if not ids:
        console.print("[yellow]No chunks found.[/yellow]")
        return

    title = f"Chunks — {filter_doc_id}" if filter_doc_id else "All Chunks"
    table = Table(title=title, box=box.ROUNDED, show_lines=True)
    table.add_column("#", justify="right", style="dim", width=4)
    table.add_column("doc_id", style="cyan", width=18, no_wrap=True)
    table.add_column("filename", style="green", width=22)
    table.add_column("chunk", justify="right", style="yellow", width=7)
    table.add_column("text preview", style="white")

    for i, (chunk_id, text, meta) in enumerate(zip(ids, documents, metadatas), start=1):
        preview = (text[:120] + "…") if len(text) > 120 else text
        preview = preview.replace("\n", " ")
        chunk_idx = meta.get("chunk_index", "?")
        total = meta.get("total_chunks", "?")
        table.add_row(
            str(i),
            meta.get("document_id", "?"),
            meta.get("filename", "?"),
            f"{chunk_idx}/{total}",
            preview,
        )

    console.print(table)
    console.print(f"\n[bold]Showing {len(ids)} chunk(s)[/bold]")


def cmd_embeddings(limit: int = 10):
    """Show raw embedding vectors (first 8 dimensions, truncated)."""
    result = collection.get(
        limit=limit,
        include=["embeddings", "metadatas"],
    )

    ids = result.get("ids") or []
    embeddings = result.get("embeddings") or []
    metadatas = result.get("metadatas") or []

    if not ids:
        console.print("[yellow]No embeddings found.[/yellow]")
        return

    dim = len(embeddings[0]) if embeddings else 0
    table = Table(
        title=f"Embedding Vectors (first {limit} chunks, showing 8/{dim} dims)",
        box=box.ROUNDED,
        show_lines=True,
    )
    table.add_column("chunk_id", style="cyan", no_wrap=True)
    table.add_column("filename", style="green")
    table.add_column(f"vector[:8] of {dim} dims", style="white")

    for chunk_id, emb, meta in zip(ids, embeddings, metadatas):
        sample = [f"{v:.4f}" for v in emb[:8]]
        table.add_row(
            chunk_id,
            meta.get("filename", "?"),
            "[" + ", ".join(sample) + ", …]",
        )

    console.print(table)
    console.print(f"\n[bold]Embedding dimensions:[/bold] {dim}")


def cmd_viz():
    """
    Open an interactive 3D scatter plot of chunk embeddings in the browser.
    PCA reduces 1024 dims → 3 dims. Each dot is a chunk, coloured by document.
    Hover shows the chunk text preview.
    """
    import numpy as np
    import plotly.graph_objects as go
    from sklearn.decomposition import PCA

    result = collection.get(include=["embeddings", "metadatas", "documents"])
    embeddings = result.get("embeddings") or []
    metadatas  = result.get("metadatas")  or []
    documents  = result.get("documents")  or []

    if len(embeddings) < 3:
        console.print("[yellow]Need at least 3 chunks to visualise.[/yellow]")
        return

    console.print(f"[cyan]Reducing {len(embeddings)} vectors → 3D via PCA…[/cyan]")
    X = np.array(embeddings)
    coords = PCA(n_components=3).fit_transform(X)

    filenames     = [m.get("filename", "unknown") for m in metadatas]
    chunk_indices = [m.get("chunk_index", "?")    for m in metadatas]
    unique_files  = sorted(set(filenames))

    # One trace per document so the legend shows each file name
    COLOURS = [
        "#6366f1", "#f59e0b", "#10b981", "#ef4444",
        "#3b82f6", "#ec4899", "#14b8a6", "#f97316",
    ]

    traces = []
    for i, fname in enumerate(unique_files):
        mask = [j for j, fn in enumerate(filenames) if fn == fname]
        hover = [
            f"<b>{fname}</b>  chunk {chunk_indices[j]}<br><br>"
            + (documents[j][:300].replace("\n", " ") + "…" if len(documents[j]) > 300 else documents[j].replace("\n", " "))
            for j in mask
        ]
        traces.append(go.Scatter3d(
            x=coords[mask, 0],
            y=coords[mask, 1],
            z=coords[mask, 2],
            mode="markers",
            name=fname,
            marker=dict(
                size=7,
                color=COLOURS[i % len(COLOURS)],
                opacity=0.85,
                line=dict(width=0.5, color="white"),
            ),
            text=hover,
            hovertemplate="%{text}<extra></extra>",
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
        legend=dict(
            title="Documents",
            bgcolor="#2a2a3e",
            bordercolor="#444",
            borderwidth=1,
        ),
        margin=dict(l=0, r=0, b=0, t=50),
    )

    console.print(f"[green]Opening browser — {len(embeddings)} chunks across {len(unique_files)} document(s)[/green]")
    fig.show()


def cmd_stats():
    """Print collection statistics."""
    result = collection.get(include=["metadatas", "embeddings"])
    metadatas = result.get("metadatas") or []
    embeddings = result.get("embeddings") or []

    doc_ids = {m.get("document_id") for m in metadatas if m.get("document_id")}
    filenames = {m.get("filename") for m in metadatas if m.get("filename")}
    dim = len(embeddings[0]) if embeddings else 0

    table = Table(title="Collection Statistics", box=box.ROUNDED)
    table.add_column("metric", style="cyan")
    table.add_column("value", style="yellow")

    table.add_row("Collection name", "contracts")
    table.add_row("Persist directory", settings.CHROMA_PERSIST_DIR)
    table.add_row("Unique documents", str(len(doc_ids)))
    table.add_row("Unique filenames", str(len(filenames)))
    table.add_row("Total chunks", str(len(metadatas)))
    table.add_row("Embedding dimensions", str(dim))
    table.add_row("Embedding model", settings.EMBEDDING_MODEL_NAME)

    console.print(table)


COMMANDS = {
    "summary": cmd_summary,
    "chunks": cmd_chunks,
    "embeddings": cmd_embeddings,
    "stats": cmd_stats,
    "viz": cmd_viz,
}

if __name__ == "__main__":
    args = sys.argv[1:]
    cmd = args[0] if args else "summary"

    if cmd == "chunks":
        filter_id = args[1] if len(args) > 1 else None
        cmd_chunks(filter_id)
    elif cmd in COMMANDS:
        COMMANDS[cmd]()
    else:
        console.print(f"[red]Unknown command '{cmd}'[/red]")
        console.print("Available: summary, chunks [doc_id], embeddings, stats, viz")
        sys.exit(1)
