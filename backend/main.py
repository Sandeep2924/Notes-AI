import os
import uuid
import traceback
from pathlib import Path
from typing import Optional

# ── Load .env FIRST — Windows does NOT auto-load it ──────────────────────────
from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

import fitz  # PyMuPDF
from PIL import Image
import pytesseract
import io

from sentence_transformers import SentenceTransformer
import chromadb
from groq import Groq

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Notes AI API", version="1.0.0")

# ── CORS: read allowed origins from env so you never need to redeploy ─────────
# In Render, set: ALLOWED_ORIGINS=https://notes-ai.vercel.app,https://notes-ai-sandeep2924s-projects.vercel.app
# Leave unset (or set to *) to allow all origins during development.
_raw_origins = os.getenv("ALLOWED_ORIGINS", "*").strip()

if _raw_origins == "*":
    # Allow all origins — fine for dev or if you want open access
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,   # credentials=True is incompatible with allow_origins=["*"]
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    # Production: explicit list from environment variable
    _allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]
    # Always include localhost for local dev
    _allowed_origins += ["http://localhost:3000", "http://localhost:3001"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# ── Global error handler — shows FULL traceback in terminal ───────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    print("\n" + "="*60)
    print(f"UNHANDLED ERROR  {request.method} {request.url.path}")
    print(tb)
    print("="*60 + "\n")
    return JSONResponse(
        status_code=500,
        content={"detail": f"{type(exc).__name__}: {str(exc)}"}
    )

# ── Tesseract: auto-detect on Windows ────────────────────────────────────────
_TESSERACT_CANDIDATES = [
    r"C:\Program Files\Tesseract-OCR\tesseract.exe",
    r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    rf"C:\Users\{os.getenv('USERNAME','')}\AppData\Local\Programs\Tesseract-OCR\tesseract.exe",
]
for _p in _TESSERACT_CANDIDATES:
    if Path(_p).exists():
        pytesseract.pytesseract.tesseract_cmd = _p
        print(f"Tesseract found: {_p}")
        break

# ── Config ────────────────────────────────────────────────────────────────────
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

# ── Startup diagnostics ───────────────────────────────────────────────────────
print("\n" + "="*52)
print("  NotesAI Backend Starting")
print(f"  GROQ_API_KEY : {'SET ✅' if GROQ_API_KEY else 'MISSING ❌  — edit backend/.env!'}")
print(f"  Working dir  : {Path.cwd()}")
env_path = Path(__file__).resolve().parent / ".env"
print(f"  .env exists  : {env_path.exists()} ({env_path})")
print("="*52 + "\n")

# ── Embedding model ───────────────────────────────────────────────────────────
print("Loading embedding model (first run downloads ~90 MB)...")
embedder = SentenceTransformer("all-MiniLM-L6-v2")
print("Embedding model ready.\n")

# ── ChromaDB ──────────────────────────────────────────────────────────────────
chroma_client = chromadb.PersistentClient(path="./chroma_db")
collection = chroma_client.get_or_create_collection(
    name="notes",
    metadata={"hnsw:space": "cosine"}
)
print(f"ChromaDB ready. Existing chunks: {collection.count()}\n")

# ── Groq client ───────────────────────────────────────────────────────────────
groq_client = Groq(api_key=GROQ_API_KEY)


# ── Text helpers ──────────────────────────────────────────────────────────────

def extract_text_from_pdf(file_bytes: bytes) -> str:
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    pages = [page.get_text() for page in doc]
    doc.close()
    return "\n".join(pages).strip()


def extract_text_from_image(file_bytes: bytes) -> str:
    image = Image.open(io.BytesIO(file_bytes))
    try:
        return pytesseract.image_to_string(image, lang="eng+hin").strip()
    except pytesseract.TesseractError:
        print("Hindi OCR pack missing, falling back to English only.")
        return pytesseract.image_to_string(image, lang="eng").strip()


def chunk_text(text: str, chunk_size: int = 400, overlap: int = 80) -> list[str]:
    words = text.split()
    chunks, start = [], 0
    while start < len(words):
        end = min(start + chunk_size, len(words))
        chunk = " ".join(words[start:end])
        if len(chunk.strip()) > 20:
            chunks.append(chunk)
        start += chunk_size - overlap
    return chunks


def embed_and_store(chunks: list[str], doc_id: str, filename: str):
    embeddings = embedder.encode(chunks).tolist()
    ids = [f"{doc_id}_{i}" for i in range(len(chunks))]
    metas = [{"filename": filename, "doc_id": doc_id, "chunk_index": i} for i in range(len(chunks))]
    collection.add(documents=chunks, embeddings=embeddings, ids=ids, metadatas=metas)


def retrieve_chunks(question: str, top_k: int = 4) -> list[str]:
    q_emb = embedder.encode([question]).tolist()
    results = collection.query(query_embeddings=q_emb, n_results=top_k)
    return results["documents"][0] if results and results["documents"] else []


def build_prompt(question: str, chunks: list[str]) -> str:
    context = "\n\n---\n\n".join(chunks)
    return f"""You are a helpful study assistant. Answer ONLY from the notes below.

RULES:
1. Use ONLY the provided notes — no outside knowledge.
2. If not in notes: "Yeh information aapke notes mein nahi mili."
3. Match the language of the question (Hindi or English).
4. Be concise and student-friendly. Use bullet points when helpful.

--- NOTES ---
{context}
--- END ---

Question: {question}
Answer:"""


# ── Pydantic models ───────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    question: str
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    sources: list[str]
    chunks_used: int


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "Notes AI Backend Running", "version": "1.0.0"}


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "chunks_stored": collection.count(),
        "groq_configured": bool(GROQ_API_KEY),
        "model": "all-MiniLM-L6-v2"
    }


@app.get("/stats")
def stats():
    count = collection.count()
    return {"chunks_stored": count, "ready": count > 0}


@app.post("/upload")
async def upload_notes(file: UploadFile = File(...)):
    print(f"\nUpload: {file.filename}  type={file.content_type}")

    if not GROQ_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="GROQ_API_KEY missing. Create backend/.env with: GROQ_API_KEY=gsk_..."
        )

    content_type = file.content_type or ""
    filename = file.filename or "unknown"
    is_pdf = "pdf" in content_type or filename.lower().endswith(".pdf")
    is_img = content_type in {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/tiff", "image/bmp"}

    if not is_pdf and not is_img:
        raise HTTPException(status_code=400, detail=f"Unsupported type '{content_type}'. Send a PDF or image.")

    file_bytes = await file.read()
    print(f"  Size: {len(file_bytes)/1024:.1f} KB")

    try:
        text = extract_text_from_pdf(file_bytes) if is_pdf else extract_text_from_image(file_bytes)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Text extraction error: {str(e)}")

    print(f"  Extracted {len(text)} chars")

    if len(text.strip()) < 10:
        raise HTTPException(
            status_code=422,
            detail="No readable text found. For PDFs, ensure it's not a scanned image-only file. For images, try a clearer photo."
        )

    chunks = chunk_text(text)
    doc_id = uuid.uuid4().hex[:8]
    embed_and_store(chunks, doc_id, filename)
    print(f"  Stored {len(chunks)} chunks. Total: {collection.count()}")

    return {
        "success": True,
        "filename": filename,
        "doc_id": doc_id,
        "chunks_created": len(chunks),
        "total_characters": len(text),
        "preview": text[:300] + ("..." if len(text) > 300 else ""),
    }


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    print(f"\nChat: {req.question[:80]}")

    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not set.")
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Empty question.")
    if collection.count() == 0:
        raise HTTPException(status_code=400, detail="No notes uploaded yet. Upload a PDF or image first.")

    chunks = retrieve_chunks(req.question, top_k=4)
    if not chunks:
        return ChatResponse(answer="Aapke notes mein koi relevant information nahi mili.", sources=[], chunks_used=0)

    try:
        completion = groq_client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": build_prompt(req.question, chunks)}],
            temperature=0.2,
            max_tokens=1024,
        )
        answer = completion.choices[0].message.content.strip()
        print(f"  Answer: {len(answer)} chars")
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Groq error: {str(e)}")

    return ChatResponse(
        answer=answer,
        sources=[c[:120] + "..." for c in chunks],
        chunks_used=len(chunks)
    )


@app.delete("/clear")
def clear_notes():
    global collection
    chroma_client.delete_collection("notes")
    collection = chroma_client.get_or_create_collection(name="notes", metadata={"hnsw:space": "cosine"})
    print("Notes cleared.")
    return {"success": True, "message": "All notes cleared."}
