# 🧠 NotesAI — Your Personal Study Assistant

> Upload your notes (PDF or image). Ask anything in Hindi or English. Get answers ONLY from your notes — no hallucinations.

---

## 🗂️ Project Structure

```
notes-ai/
├── backend/          ← FastAPI + Groq + ChromaDB
│   ├── main.py
│   ├── requirements.txt
│   ├── .env.example
│   └── start.sh
├── frontend/         ← Next.js + Tailwind
│   ├── src/
│   │   ├── pages/
│   │   └── styles/
│   ├── package.json
│   └── next.config.js
├── SETUP.md
└── README.md
```

---

## ⚡ Prerequisites

Make sure these are installed on your system:

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.10+ | https://python.org |
| Node.js | 18+ | https://nodejs.org |
| pip | latest | comes with Python |
| npm | latest | comes with Node |
| Tesseract OCR | any | see below |

### Install Tesseract OCR

**Windows:**
1. Download installer from: https://github.com/UB-Mannheim/tesseract/wiki
2. Install it (default path: `C:\Program Files\Tesseract-OCR\tesseract.exe`)
3. Add to PATH or set in code

**Mac:**
```bash
brew install tesseract tesseract-lang
```

**Ubuntu/Debian:**
```bash
sudo apt-get install tesseract-ocr tesseract-ocr-hin tesseract-ocr-eng
```

---

## 🔑 Step 1: Get Your FREE Groq API Key

1. Go to https://console.groq.com
2. Sign up (free, no credit card needed)
3. Click **"Create API Key"**
4. Copy the key — it starts with `gsk_...`

---

## 🐍 Step 2: Backend Setup

Open a terminal and run:

```bash
# Go to backend folder
cd notes-ai/backend

# Create a virtual environment
python -m venv venv

# Activate it:
source venv311/Scripts/activate

# Install all dependencies
pip install -r requirements.txt

# Create your .env file
cp .env.example .env

# Edit .env and paste your Groq API key:
# GROQ_API_KEY=gsk_your_key_here
```

### ▶️ Start the Backend

```bash
python -m uvicorn main:app --reload
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete.
```

**Test it:** Open http://localhost:8000/health in browser. You should see JSON with `"status": "healthy"`.

---

## 🌐 Step 3: Frontend Setup

Open a **NEW terminal** (keep backend running in the first one):

```bash
# Go to frontend folder
cd notes-ai/frontend

# Install Node.js packages
npm install

# Start the development server
npm run dev
```

You should see:
```
- ready started server on 0.0.0.0:3000
- Local: http://localhost:3000
```

**Open http://localhost:3000 in your browser.**

---

## 🚀 You're Live!

1. **Upload** your PDF or notes image in the left sidebar
2. Wait for it to process (you'll see "X chunks stored")
3. **Ask questions** in Hindi or English in the chat box
4. Get instant answers from YOUR notes only!

---

## 📦 All pip packages explained

| Package | Why we need it |
|---------|---------------|
| `fastapi` | Our web server framework |
| `uvicorn` | Runs the FastAPI server |
| `python-multipart` | Handles file uploads |
| `pymupdf` | Reads PDF files (fitz) |
| `pillow` | Handles image files |
| `pytesseract` | OCR — reads text from images |
| `sentence-transformers` | Converts text to vectors (embeddings) |
| `chromadb` | Stores and searches vectors locally |
| `groq` | Calls Groq's fast LLM API |
| `pydantic` | Data validation for API |

---

## 🔧 Troubleshooting

### ❌ "GROQ_API_KEY not set"
→ Make sure you created `backend/.env` with your key

### ❌ "TesseractNotFoundError"
→ Install Tesseract OCR (see prerequisites above)
→ On Windows, also add it to your PATH

### ❌ "Connection refused" on frontend
→ Make sure backend is running on port 8000

### ❌ Slow first startup
→ First run downloads the embedding model (~90MB) — this is normal, wait 1-2 minutes

### ❌ "No notes uploaded" error when chatting
→ Upload a PDF/image first before asking questions

---

## 🏗️ How it Works (The Pipeline)

```
📄 PDF/Image
     ↓
🔤 Text Extraction (PyMuPDF / Tesseract OCR)
     ↓
✂️  Chunking (400-word overlapping chunks)
     ↓
🔢 Embedding (SentenceTransformers all-MiniLM-L6-v2)
     ↓
💾 ChromaDB (local vector database)

[When you ask a question:]

❓ Your Question
     ↓
🔍 Similarity Search (finds top 4 relevant chunks)
     ↓
📝 Prompt = Context + Question + "Answer ONLY from notes"
     ↓
⚡ Groq (Llama 3 70B) → 500 tokens/sec
     ↓
💬 Answer in your language
```

---

## 🌟 Features

- ✅ Upload PDF notes
- ✅ Upload handwritten image notes (OCR)
- ✅ Hindi + English questions and answers
- ✅ Zero hallucinations (strict context mode)
- ✅ Instant responses (Groq speed)
- ✅ Source snippets shown per answer
- ✅ Beautiful dark UI
- ✅ Local vector storage (your data stays on your machine)

---

Made with ❤️ for students
