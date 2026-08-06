import os
import uuid
import traceback
import shutil
from pathlib import Path
from typing import Optional
from datetime import timedelta

# ── Load .env FIRST — Windows does NOT auto-load it ──────────────────────────
from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, status, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.security import OAuth2PasswordRequestForm
import os
import uuid
from pathlib import Path
import shutil
from supabase import create_client, Client
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

import fitz  # PyMuPDF
from PIL import Image
import pytesseract
import io

from groq import Groq
import re
import math
from collections import Counter

# ── DB & Auth ────────────────────────────────────────────────────────────────
from database import engine, get_db, SessionLocal
import models
from auth import get_password_hash, verify_password, create_access_token, get_current_user, get_user_from_token, ACCESS_TOKEN_EXPIRE_MINUTES

# Initialize Database
models.Base.metadata.create_all(bind=engine)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Notes AI API", version="1.0.0")

# ── CORS ──────────────────────────────────────────────────────────────────────
_raw_origins = os.getenv("ALLOWED_ORIGINS", "*").strip()

if _raw_origins == "*":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    _allowed_origins = [o.strip().rstrip('/') for o in _raw_origins.split(",") if o.strip()]
    _allowed_origins += ["http://localhost:3000", "http://localhost:3001"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

from starlette.exceptions import HTTPException as StarletteHTTPException

# ── Global error handler ──────────────────────────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, StarletteHTTPException):
        raise exc
    tb = traceback.format_exc()
    print("\n" + "="*60)
    print(f"UNHANDLED ERROR  {request.method} {request.url.path}")
    print(tb)
    print("="*60 + "\n")
    return JSONResponse(
        status_code=500,
        content={"detail": f"{type(exc).__name__}: {str(exc)}"}
    )

# ── Tesseract ─────────────────────────────────────────────────────────────────
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

# Supabase Setup
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
SUPABASE_BUCKET_NAME = os.getenv("SUPABASE_BUCKET_NAME", "documents")

supabase_client: Client | None = None
if SUPABASE_URL and SUPABASE_SERVICE_KEY:
    supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Lightweight search mode enabled (0MB RAM)
print("Running in lightweight mode (BM25 Search). AI Embeddings disabled to save memory.\n")

groq_client = Groq(api_key=GROQ_API_KEY)


# ── Text helpers ──────────────────────────────────────────────────────────────

def extract_text_from_pdf(source) -> str:
    if isinstance(source, io.BytesIO):
        doc = fitz.open(stream=source.read(), filetype="pdf")
    elif isinstance(source, bytes):
        doc = fitz.open(stream=source, filetype="pdf")
    else:
        doc = fitz.open(source)
    
    pages = [page.get_text() for page in doc]
    doc.close()
    return "\n".join(pages).strip()


def extract_text_from_image(file_bytes: bytes) -> str:
    image = Image.open(io.BytesIO(file_bytes))
    try:
        return pytesseract.image_to_string(image, lang="eng+hin").strip()
    except pytesseract.TesseractError:
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


def embed_and_store(chunks: list[str], doc_id: str, filename: str, user_id: int):
    db = SessionLocal()
    try:
        for i, chunk in enumerate(chunks):
            db.add(models.DocumentChunk(doc_id=doc_id, user_id=user_id, chunk_index=i, text=chunk))
        db.commit()
    finally:
        db.close()

def simple_bm25_search(query: str, chunks: list[str], top_k: int = 4) -> list[str]:
    def tokenize(text):
        return [w.lower() for w in re.findall(r'\w+', text)]
    q_words = tokenize(query)
    if not q_words or not chunks:
        return chunks[:top_k]
    df = Counter()
    tokenized_chunks = []
    for chunk in chunks:
        words = tokenize(chunk)
        tokenized_chunks.append(words)
        for w in set(words):
            df[w] += 1
    N = len(chunks)
    scores = []
    for i, words in enumerate(tokenized_chunks):
        score = 0
        words_count = Counter(words)
        for w in q_words:
            if w in words_count:
                tf = words_count[w]
                idf = math.log(1 + (N - df[w] + 0.5) / (df[w] + 0.5))
                score += idf * (tf * 2.5) / (tf + 1.5)
        scores.append((score, chunks[i]))
    scores.sort(key=lambda x: x[0], reverse=True)
    return [s[1] for s in scores[:top_k] if s[0] > 0] or chunks[:top_k]


def retrieve_chunks(question: str, user_id: int, doc_ids: Optional[list[str]] = None, top_k: int = 4) -> list[str]:
    db = SessionLocal()
    try:
        query = db.query(models.DocumentChunk).filter(models.DocumentChunk.user_id == user_id)
        if doc_ids:
            query = query.filter(models.DocumentChunk.doc_id.in_(doc_ids))
        all_chunks = [c.text for c in query.all()]
        if not all_chunks:
            return []
        return simple_bm25_search(question, all_chunks, top_k)
    finally:
        db.close()


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

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

class ChatRequest(BaseModel):
    question: str
    session_id: Optional[str] = None

class ChatResponse(BaseModel):
    answer: str
    sources: list[str]
    chunks_used: int

class AnnotationCreate(BaseModel):
    page_num: int
    text_content: str
    comment: Optional[str] = None
    bounding_box: str
    color: str = "yellow"

class AnnotationUpdate(BaseModel):
    comment: Optional[str] = None
    color: Optional[str] = None

class FolderCreate(BaseModel):
    name: str
    parent_id: Optional[int] = None

class FolderRename(BaseModel):
    name: str

class DocumentMove(BaseModel):
    folder_id: Optional[int] = None

class DocumentProgress(BaseModel):
    last_page_read: int

class ChatHistoryRequest(BaseModel):
    question: str
    doc_id: Optional[str] = None
    folder_id: Optional[int] = None
    session_id: Optional[str] = None

@app.post("/signup", response_model=Token)
def signup(user_data: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user_data.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_pwd = get_password_hash(user_data.password)
    new_user = models.User(email=user_data.email, name=user_data.name, password_hash=hashed_pwd)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": new_user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "user": {"id": new_user.id, "name": new_user.name, "email": new_user.email}}

@app.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "user": {"id": user.id, "name": user.name, "email": user.email}}

@app.get("/me")
def get_me(current_user: models.User = Depends(get_current_user)):
    return {"id": current_user.id, "name": current_user.name, "email": current_user.email}


# ── Feature Routes ────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "Notes AI Backend Running (V2 with Auth)", "version": "1.0.0"}


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "chunks_stored": collection.count(),
        "groq_configured": bool(GROQ_API_KEY),
        "model": "all-MiniLM-L6-v2"
    }


@app.get("/stats")
def stats(current_user: models.User = Depends(get_current_user)):
    # Basic stats; could be expanded to user-specific
    count = collection.count()
    return {"chunks_stored": count, "ready": count > 0}

@app.get("/documents")
def get_documents(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    docs = db.query(models.Document).filter(models.Document.user_id == current_user.id).order_by(models.Document.created_at.desc()).all()
    return [
        {
            "docId": doc.id,
            "name": doc.title,
            "chunks": doc.chunks,
            "chars": doc.chars,
            "uploadedAt": doc.created_at,
            "lastOpenedAt": doc.last_opened_at,
            "lastPageRead": doc.last_page_read or 1,
            "folderId": doc.folder_id,
            "preview": doc.preview
        } for doc in docs
    ]


@app.post("/upload")
async def upload(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    print(f"\nUpload by {current_user.email}: {file.filename} type={file.content_type}")

    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY missing.")

    MAX_FILE_SIZE = 25 * 1024 * 1024 # 25 MB limit
    if file.size and file.size > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 25MB.")

    content_type = file.content_type or ""
    filename = file.filename or "unknown"
    is_pdf = "pdf" in content_type or filename.lower().endswith(".pdf")
    is_img = content_type in {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/tiff", "image/bmp"}

    if not is_pdf and not is_img:
        raise HTTPException(status_code=400, detail=f"Unsupported type '{content_type}'. Send a PDF or image.")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 25MB.")

    file_ext = Path(filename).suffix
    doc_id = uuid.uuid4().hex[:8]
    # SECURITY: Prevent directory traversal by strictly controlling the stored filename
    unique_filename = f"{doc_id}{file_ext}"
    
    file_location = ""
    # Try uploading to Supabase if configured
    if supabase_client:
        object_name = f"{current_user.id}/{unique_filename}"
        try:
            res = supabase_client.storage.from_(SUPABASE_BUCKET_NAME).upload(
                path=object_name,
                file=content,
                file_options={"content-type": file.content_type}
            )
            file_location = f"supabase://{object_name}"
        except Exception as e:
            print("Failed to upload to Supabase, falling back to local storage:", e)
            
    # Fallback to local storage if Supabase fails or isn't configured
    if not file_location:
        file_path = UPLOAD_DIR / unique_filename
        with open(file_path, "wb") as f:
            f.write(content)
        file_location = str(file_path)

    try:
        if is_pdf:
            import io
            pdf_source = file_location if not file_location.startswith("supabase://") else content
            text = extract_text_from_pdf(pdf_source)
        else:
            text = extract_text_from_image(content)
    except Exception as e:
        import traceback
        traceback.print_exc()
        # SECURITY: Cleanup file if it's invalid or malicious so it doesn't stay on our server
        if not file_location.startswith("supabase://") and Path(file_location).exists():
            os.remove(file_location)
        elif file_location.startswith("supabase://") and supabase_client:
            supabase_client.storage.from_(SUPABASE_BUCKET_NAME).remove([file_location.replace("supabase://", "")])
        raise HTTPException(status_code=422, detail=f"Text extraction error (corrupted file?): {str(e)}")

    if len(text.strip()) < 10:
        raise HTTPException(status_code=422, detail="No readable text found.")

    chunks = chunk_text(text)
    background_tasks.add_task(embed_and_store, chunks, doc_id, filename, current_user.id)
    
    preview_text = text[:300] + ("..." if len(text) > 300 else "")

    # Save to database
    new_doc = models.Document(
        id=doc_id,
        user_id=current_user.id,
        title=filename,
        file_path=file_location,
        chunks=len(chunks),
        chars=len(text),
        preview=preview_text
    )
    db.add(new_doc)
    db.commit()

    return {
        "success": True,
        "filename": filename,
        "doc_id": doc_id,
        "chunks_created": len(chunks),
        "total_characters": len(text),
        "preview": preview_text,
    }


@app.get("/documents/{doc_id}/file")
def get_document_file(
    doc_id: str,
    token: Optional[str] = None,
    db: Session = Depends(get_db),
    request: Request = None
):
    # Retrieve user from either query parameter or Bearer token header
    user = None
    if token:
        user = get_user_from_token(token, db)
    if not user and request:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            bearer_token = auth_header.split(" ")[1]
            user = get_user_from_token(bearer_token, db)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    doc = db.query(models.Document).filter(models.Document.id == doc_id, models.Document.user_id == user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    # Check if stored in Supabase
    if doc.file_path.startswith("supabase://"):
        if not supabase_client:
            raise HTTPException(status_code=500, detail="Supabase is not configured on the server")
        
        object_key = doc.file_path.replace("supabase://", "")
        try:
            # Download file bytes directly and serve them (bypasses Supabase CORS issues)
            res_bytes = supabase_client.storage.from_(SUPABASE_BUCKET_NAME).download(object_key)
            from fastapi.responses import Response
            return Response(content=res_bytes, media_type="application/pdf")
        except Exception as e:
            raise HTTPException(status_code=500, detail="Failed to fetch file from Supabase")
            
    # Fallback to local storage
    file_p = Path(doc.file_path)
    if not file_p.exists():
        # Try resolving relative to backend directory
        file_p = Path(__file__).parent / doc.file_path
    if not file_p.exists():
        raise HTTPException(status_code=404, detail="File missing on server")
    return FileResponse(
        str(file_p), 
        media_type="application/pdf", 
        headers={"Content-Disposition": f'inline; filename="{doc.title}"'}
    )


@app.get("/documents/{doc_id}/annotations")
def get_annotations(doc_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    annotations = db.query(models.Annotation).filter(
        models.Annotation.doc_id == doc_id,
        models.Annotation.user_id == current_user.id
    ).all()
    return annotations

@app.post("/documents/{doc_id}/annotations")
def create_annotation(doc_id: str, ann: AnnotationCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    doc = db.query(models.Document).filter(models.Document.id == doc_id, models.Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    new_ann = models.Annotation(
        doc_id=doc_id,
        user_id=current_user.id,
        page_num=ann.page_num,
        text_content=ann.text_content,
        comment=ann.comment,
        bounding_box=ann.bounding_box,
        color=ann.color
    )
    db.add(new_ann)
    db.commit()
    db.refresh(new_ann)
    return new_ann


import json
from datetime import datetime

from fastapi.responses import StreamingResponse

@app.post("/chat")
async def chat(req: ChatHistoryRequest, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not set.")
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Empty question.")

    history_messages = []
    doc_ids_to_search = None
    
    if req.folder_id:
        docs = db.query(models.Document).filter(models.Document.folder_id == req.folder_id, models.Document.user_id == current_user.id).all()
        doc_ids_to_search = [d.id for d in docs]
        if not doc_ids_to_search:
            def empty_folder_stream():
                yield f"data: {json.dumps({'type': 'metadata', 'sources': [], 'chunks_used': 0})}\n\n"
                yield f"data: {json.dumps({'type': 'chunk', 'text': 'This folder is empty. Upload some documents first.'})}\n\n"
                yield "data: [DONE]\n\n"
            return StreamingResponse(empty_folder_stream(), media_type="text/event-stream")
            
        past = db.query(models.ChatMessage).filter(
            models.ChatMessage.folder_id == req.folder_id,
            models.ChatMessage.user_id == current_user.id
        ).order_by(models.ChatMessage.created_at.desc()).limit(6).all()
    elif req.doc_id:
        doc_ids_to_search = [req.doc_id]
        past = db.query(models.ChatMessage).filter(
            models.ChatMessage.doc_id == req.doc_id,
            models.ChatMessage.user_id == current_user.id
        ).order_by(models.ChatMessage.created_at.desc()).limit(6).all()
    else:
        past = []

    if req.folder_id or req.doc_id:
        for msg in reversed(past):
            history_messages.append({"role": "user" if msg.role == "user" else "assistant", "content": msg.text})

    chunks = retrieve_chunks(req.question, user_id=current_user.id, doc_ids=doc_ids_to_search, top_k=4)

    def stream_generator():
        sources_list = [c[:120] + "..." for c in chunks] if chunks else []
        yield f"data: {json.dumps({'type': 'metadata', 'sources': sources_list, 'chunks_used': len(chunks) if chunks else 0})}\n\n"

        if not chunks:
            answer = "Aapke notes mein koi relevant information nahi mili. (Or you haven't uploaded any documents)."
            yield f"data: {json.dumps({'type': 'chunk', 'text': answer})}\n\n"
            yield "data: [DONE]\n\n"
            return

        context = "\n\n---\n\n".join(chunks)
        system_prompt = f"""You are a helpful study assistant. Answer ONLY from the notes below.

RULES:
1. Use ONLY the provided notes — no outside knowledge.
2. If not in notes: "Yeh information aapke notes mein nahi mili."
3. Match the language of the question (Hindi or English).
4. Be concise and student-friendly. Use bullet points when helpful.

--- NOTES ---
{context}
--- END ---"""

        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(history_messages)
        messages.append({"role": "user", "content": req.question})

        try:
            completion = groq_client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=messages,
                temperature=0.2,
                max_tokens=1024,
                stream=True,
            )
            
            full_answer = ""
            for chunk in completion:
                content = chunk.choices[0].delta.content
                if content:
                    full_answer += content
                    # We must escape newlines if we were doing raw text, but json.dumps handles it safely inside JSON!
                    yield f"data: {json.dumps({'type': 'chunk', 'text': content})}\n\n"
                    
            # Save to DB after streaming completes
            if req.folder_id:
                db.add(models.ChatMessage(folder_id=req.folder_id, user_id=current_user.id, role="user", text=req.question))
                db.add(models.ChatMessage(
                    folder_id=req.folder_id, user_id=current_user.id, role="ai", text=full_answer,
                    sources=json.dumps(sources_list)
                ))
                db.commit()
            elif req.doc_id:
                db.add(models.ChatMessage(doc_id=req.doc_id, user_id=current_user.id, role="user", text=req.question))
                db.add(models.ChatMessage(
                    doc_id=req.doc_id, user_id=current_user.id, role="ai", text=full_answer,
                    sources=json.dumps(sources_list)
                ))
                doc = db.query(models.Document).filter(models.Document.id == req.doc_id, models.Document.user_id == current_user.id).first()
                if doc:
                    doc.last_opened_at = datetime.utcnow()
                db.commit()
                
            yield "data: [DONE]\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'text': f'Error generating response: {str(e)}'})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(stream_generator(), media_type="text/event-stream")


@app.delete("/clear")
def clear_notes(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # Delete DB records
    docs = db.query(models.Document).filter(models.Document.user_id == current_user.id).all()
    for doc in docs:
        if Path(doc.file_path).exists():
            os.remove(doc.file_path)
        db.delete(doc)
    db.commit()

    # Clear chunks from Postgres
    db.query(models.DocumentChunk).filter(models.DocumentChunk.user_id == current_user.id).delete()
    db.commit()

    return {"success": True, "message": "Your notes have been cleared."}


@app.delete("/documents/{doc_id}")
def delete_document(doc_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    doc = db.query(models.Document).filter(models.Document.id == doc_id, models.Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    # Delete from Supabase if stored there
    if doc.file_path.startswith("supabase://") and supabase_client:
        object_key = doc.file_path.replace("supabase://", "")
        try:
            supabase_client.storage.from_(SUPABASE_BUCKET_NAME).remove([object_key])
        except Exception as e:
            print(f"Failed to delete from Supabase: {e}")
    elif Path(doc.file_path).exists():
        os.remove(doc.file_path)
        
    # Delete Chunks
    db.query(models.DocumentChunk).filter(models.DocumentChunk.doc_id == doc_id).delete()
        
    # Delete Annotations
    db.query(models.Annotation).filter(models.Annotation.doc_id == doc_id).delete()
        
    # Delete from Postgres DB
    db.delete(doc)
    db.commit()
    return {"success": True, "message": "Document deleted"}


# ── Folders Routes ────────────────────────────────────────────────────────────

@app.get("/folders")
def get_folders(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    folders = db.query(models.Folder).filter(models.Folder.user_id == current_user.id).all()
    return [{"id": f.id, "name": f.name, "parentId": f.parent_id, "createdAt": f.created_at} for f in folders]

@app.post("/folders")
def create_folder(data: FolderCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    folder = models.Folder(name=data.name, user_id=current_user.id, parent_id=data.parent_id)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return {"id": folder.id, "name": folder.name, "parentId": folder.parent_id, "createdAt": folder.created_at}

@app.patch("/folders/{folder_id}")
def rename_folder(folder_id: int, data: FolderRename, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    folder = db.query(models.Folder).filter(models.Folder.id == folder_id, models.Folder.user_id == current_user.id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    folder.name = data.name
    db.commit()
    return {"id": folder.id, "name": folder.name}

@app.delete("/folders/{folder_id}")
def delete_folder(folder_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    folder = db.query(models.Folder).filter(models.Folder.id == folder_id, models.Folder.user_id == current_user.id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    # Move documents to root
    db.query(models.Document).filter(models.Document.folder_id == folder_id).update({"folder_id": None})
    db.delete(folder)
    db.commit()
    return {"success": True}

@app.patch("/documents/{doc_id}/move")
def move_document(doc_id: str, data: DocumentMove, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    doc = db.query(models.Document).filter(models.Document.id == doc_id, models.Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    doc.folder_id = data.folder_id
    db.commit()
    return {"success": True}

@app.patch("/documents/{doc_id}/progress")
def update_progress(doc_id: str, data: DocumentProgress, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    from datetime import datetime
    doc = db.query(models.Document).filter(models.Document.id == doc_id, models.Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    doc.last_page_read = data.last_page_read
    doc.last_opened_at = datetime.utcnow()
    db.commit()
    return {"success": True}


# ── Annotation Update/Delete ──────────────────────────────────────────────────

@app.patch("/documents/{doc_id}/annotations/{ann_id}")
def update_annotation(doc_id: str, ann_id: int, data: AnnotationUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    ann = db.query(models.Annotation).filter(models.Annotation.id == ann_id, models.Annotation.user_id == current_user.id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")
    if data.comment is not None:
        ann.comment = data.comment
    if data.color is not None:
        ann.color = data.color
    db.commit()
    db.refresh(ann)
    return ann

@app.delete("/documents/{doc_id}/annotations/{ann_id}")
def delete_annotation(doc_id: str, ann_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    ann = db.query(models.Annotation).filter(models.Annotation.id == ann_id, models.Annotation.user_id == current_user.id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")
    db.delete(ann)
    db.commit()
    return {"success": True}


# ── Chat History Route ────────────────────────────────────────────────────────

@app.get("/documents/{doc_id}/chat")
def get_chat_history(doc_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    messages = db.query(models.ChatMessage).filter(
        models.ChatMessage.doc_id == doc_id,
        models.ChatMessage.user_id == current_user.id
    ).order_by(models.ChatMessage.created_at.asc()).all()
    import json
    return [{
        "id": str(m.id),
        "role": m.role,
        "text": m.text,
        "sources": json.loads(m.sources) if m.sources else [],
        "timestamp": m.created_at
    } for m in messages]


@app.get("/folders/{folder_id}/chat")
def get_folder_chat_history(folder_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    messages = db.query(models.ChatMessage).filter(
        models.ChatMessage.folder_id == folder_id,
        models.ChatMessage.user_id == current_user.id
    ).order_by(models.ChatMessage.created_at.asc()).all()
    import json
    return [{
        "id": str(m.id),
        "role": m.role,
        "text": m.text,
        "sources": json.loads(m.sources) if m.sources else [],
        "timestamp": m.created_at
    } for m in messages]

