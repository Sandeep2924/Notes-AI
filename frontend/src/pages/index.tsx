import { useState, useRef, useEffect, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import ReactMarkdown from 'react-markdown'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, Send, Trash2, BookOpen, Zap, Brain, X,
  FileText, Image as ImageIcon, CheckCircle2, AlertCircle,
  MessageSquare, Sparkles, ChevronDown, RefreshCw, Info,
  Sun, Moon, Globe, Clock, StopCircle, Hash, Loader2
} from 'lucide-react'
import { useUpload, useChat } from '@/hooks/useNotesAI'
import type { Language } from '@/hooks/useNotesAI'
import { getHealth } from '@/lib/api'

// ── Constants ──────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  { text: 'Summarize my notes', emoji: '📝' },
  { text: 'What are the key concepts?', emoji: '🔑' },
  { text: 'Explain recursion', emoji: '🔄' },
  { text: 'Arrays vs Linked Lists?', emoji: '📊' },
  { text: 'What is time complexity?', emoji: '⏱️' },
  { text: 'Binary search kaise kaam karta hai?', emoji: '🔍' },
]

const LANG_OPTIONS: { value: Language; label: string; flag: string }[] = [
  { value: 'auto', label: 'Auto', flag: '🌐' },
  { value: 'en', label: 'English', flag: '🇬🇧' },
  { value: 'hi', label: 'हिंदी', flag: '🇮🇳' },
]

// ── Sub-components ─────────────────────────────────────────────────────────

function StatusDot({ ok }: { ok: boolean | null }) {
  const color = ok === null ? 'var(--muted)' : ok ? 'var(--success)' : 'var(--danger)'
  const label = ok === null ? 'Connecting…' : ok ? 'Online' : 'Offline'
  return (
    <div className="chip" style={{ background: 'var(--surface2)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
      <span
        style={{
          width: 7, height: 7, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0,
          boxShadow: ok ? `0 0 6px ${color}` : 'none',
          transition: 'background 0.5s, box-shadow 0.5s',
        }}
      />
      {label}
    </div>
  )
}

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
      className="flex justify-start"
    >
      <div className="msg-ai px-5 py-4 flex items-center gap-3">
        <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent)' }}>
          <Brain size={12} color="white" />
        </div>
        <div className="flex gap-1.5 items-center">
          {[0, 1, 2].map(i => (
            <span key={i} className={`w-2 h-2 rounded-full dot-${i + 1}`}
              style={{ background: 'var(--accent)', display: 'inline-block' }} />
          ))}
          <span className="text-xs ml-2 mono" style={{ color: 'var(--muted)' }}>
            Searching notes…
          </span>
        </div>
      </div>
    </motion.div>
  )
}

function MessageBubble({ msg }: { msg: ReturnType<typeof useChat>['messages'][0] }) {
  const [showSrc, setShowSrc] = useState(false)
  const isUser = msg.role === 'user'
  const isSystem = msg.role === 'system'

  if (isSystem) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        className="flex justify-center"
      >
        <div className="max-w-sm px-4 py-3 rounded-2xl text-sm text-center"
          style={{ background: 'var(--accent-light)', border: '1px solid rgba(124,106,247,0.25)', color: 'var(--text-secondary)' }}>
          <ReactMarkdown className="prose-ai">{msg.text}</ReactMarkdown>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 350, damping: 28 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`max-w-[78%] ${isUser ? 'msg-user' : 'msg-ai'} px-5 py-4`}
        style={msg.error ? { borderColor: 'var(--danger)', background: 'var(--danger-light)' } : {}}>
        {!isUser && (
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent)' }}>
              <Brain size={11} color="white" />
            </div>
            <span className="text-xs font-semibold mono" style={{ color: 'var(--accent)' }}>NotesAI</span>
          </div>
        )}
        <div className={isUser ? 'text-sm' : 'prose-ai'}>
          {isUser ? <p style={{ color: 'var(--text)' }}>{msg.text}</p> : <ReactMarkdown>{msg.text}</ReactMarkdown>}
        </div>

        {/* Sources accordion */}
        {!isUser && msg.sources && msg.sources.length > 0 && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            <button onClick={() => setShowSrc(v => !v)}
              className="flex items-center gap-1.5 text-xs hover:opacity-70 transition-opacity"
              style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
              <MessageSquare size={11} />
              {msg.chunks} section{msg.chunks !== 1 ? 's' : ''} referenced
              <ChevronDown size={11} style={{ transform: showSrc ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </button>
            <AnimatePresence>
              {showSrc && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="mt-2 space-y-1.5">
                    {msg.sources.map((s, i) => (
                      <div key={i} className="px-3 py-2 rounded-lg text-xs mono"
                        style={{ background: 'var(--accent-light)', border: '1px solid rgba(124,106,247,0.2)', color: 'var(--text-secondary)' }}>
                        <span style={{ color: 'var(--accent)' }}>§{i + 1} </span>{s}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Footer: timestamp + latency */}
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {!isUser && msg.latency && (
              <span className="text-xs mono flex items-center gap-1" style={{ color: 'var(--border)' }}>
                <Clock size={9} /> {(msg.latency / 1000).toFixed(1)}s
              </span>
            )}
          </div>
          <span className="text-xs mono" style={{ color: 'var(--border)' }}>
            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </motion.div>
  )
}

// ── Language Selector ──────────────────────────────────────────────────────

function LangSelector({ value, onChange }: { value: Language; onChange: (l: Language) => void }) {
  const [open, setOpen] = useState(false)
  const cur = LANG_OPTIONS.find(o => o.value === value)!
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)}
        className="chip hover:opacity-80 transition-opacity cursor-pointer"
        style={{ background: 'var(--surface2)', borderColor: 'var(--border)', color: 'var(--text-secondary)', gap: 4 }}>
        <Globe size={11} /> {cur.flag} {cur.label}
        <ChevronDown size={10} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            style={{
              position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', minWidth: 130,
            }}>
            {LANG_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:opacity-70 transition-opacity"
                style={{
                  background: opt.value === value ? 'var(--accent-light)' : 'transparent',
                  color: opt.value === value ? 'var(--accent)' : 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                }}>
                {opt.flag} {opt.label}
                {opt.value === value && <CheckCircle2 size={10} style={{ marginLeft: 'auto' }} />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function Home() {
  const [input, setInput] = useState('')
  const [backendOk, setBackendOk] = useState<boolean | null>(null)
  const [chunksTotal, setChunksTotal] = useState(0)
  const [modelName, setModelName] = useState('')
  const [language, setLanguage] = useState<Language>('auto')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const chatRef = useRef<HTMLDivElement>(null)

  const { uploading, uploadProgress, files, upload, clear: clearFiles } = useUpload()
  const { messages, loading, send, cancel, addSystemMessage, clearMessages } = useChat()

  // Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Health check
  const checkHealth = useCallback(async () => {
    try {
      const h = await getHealth()
      setBackendOk(h.status === 'healthy')
      setChunksTotal(h.chunks_stored)
      if (h.model) setModelName(h.model.split('-').slice(0, 3).join('-'))
    } catch { setBackendOk(false) }
  }, [])

  useEffect(() => {
    checkHealth()
    const id = setInterval(checkHealth, 25_000)
    return () => clearInterval(id)
  }, [checkHealth])

  // Scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  // File drop
  const onDrop = useCallback(async (accepted: File[]) => {
    if (!accepted.length) return
    const result = await upload(accepted[0])
    if (result) {
      setChunksTotal(n => n + result.chunks_created)
      if (messages.length === 0) {
        addSystemMessage(
          `**Notes loaded!** 🎓\n\n"**${result.filename}**" — **${result.chunks_created}** sections indexed.\n\nAsk anything below in Hindi or English.`
        )
      }
    }
  }, [upload, messages.length, addSystemMessage])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024, // 50 MB
    disabled: uploading,
    onDropRejected: rejected => {
      const reason = rejected[0]?.errors[0]?.code
      if (reason === 'file-too-large') {
        import('react-hot-toast').then(m => m.default.error('File is too large (max 50 MB).'))
      } else {
        import('react-hot-toast').then(m => m.default.error('Unsupported file type.'))
      }
    },
  })

  const handleSend = () => {
    const q = input.trim()
    if (!q || loading) return
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    send(q, language)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleClearAll = async () => {
    clearMessages()
    await clearFiles()
    setChunksTotal(0)
  }

  const notesReady = chunksTotal > 0

  return (
    <div className="noise grid-bg h-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 flex items-center justify-between px-5 py-3"
        style={{ borderBottom: '1px solid var(--border)', background: 'rgba(8,8,16,0.92)', backdropFilter: 'blur(24px)', zIndex: 10 }}>
        <div className="flex items-center gap-3">
          <button onClick={() => setSidebarOpen(v => !v)} title="Toggle sidebar"
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-70 transition-opacity"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <Hash size={14} style={{ color: 'var(--muted)' }} />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center glow-accent"
              style={{ background: 'linear-gradient(135deg, #7c6af7, #5b4de0)' }}>
              <Brain size={16} color="white" />
            </div>
            <div>
              <h1 className="text-sm font-bold leading-none">
                Notes<span style={{ color: 'var(--accent)' }}>AI</span>
              </h1>
              {modelName && (
                <p className="text-xs leading-none mt-0.5 mono" style={{ color: 'var(--muted)' }}>
                  {modelName}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusDot ok={backendOk} />

          {chunksTotal > 0 && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="chip" style={{ background: 'var(--success-light)', borderColor: 'rgba(106,247,168,0.3)', color: 'var(--success)' }}>
              <Zap size={10} /> {chunksTotal} chunks
            </motion.div>
          )}

          <LangSelector value={language} onChange={setLanguage} />

          <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            title="Toggle theme"
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-70 transition-opacity"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            {theme === 'dark' ? <Sun size={13} style={{ color: 'var(--accent2)' }} /> : <Moon size={13} style={{ color: 'var(--accent)' }} />}
          </button>

          <button onClick={checkHealth} title="Refresh connection"
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-70 transition-opacity"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <RefreshCw size={12} style={{ color: 'var(--muted)' }} />
          </button>

          {(files.length > 0 || messages.length > 0) && (
            <button onClick={handleClearAll}
              className="chip hover:opacity-70 transition-opacity cursor-pointer"
              style={{ background: 'var(--danger-light)', borderColor: 'rgba(247,106,106,0.3)', color: 'var(--danger)' }}>
              <Trash2 size={10} /> Clear
            </button>
          )}
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Sidebar ────────────────────────────────────────────── */}
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }} animate={{ width: 280, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 350, damping: 32 }}
              className="flex-shrink-0 flex flex-col overflow-hidden"
              style={{ borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>

              {/* Upload zone */}
              <div className="p-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                <p className="text-xs font-semibold tracking-widest uppercase mb-3 mono" style={{ color: 'var(--muted)' }}>
                  📚 Upload Notes
                </p>
                <div
                  {...getRootProps()}
                  className={`cursor-pointer rounded-2xl p-5 text-center transition-all duration-200 upload-zone ${uploading ? 'opacity-50 pointer-events-none' : ''} ${isDragActive ? 'drag-active' : ''}`}
                  style={{ border: `2px dashed ${isDragActive ? 'var(--accent)' : 'var(--border)'}`, background: isDragActive ? 'var(--accent-light)' : 'var(--surface2)' }}>
                  <input {...getInputProps()} />
                  {uploading ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ border: '2px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }}>
                        <Loader2 size={14} style={{ color: 'var(--accent)' }} />
                      </div>
                      <div>
                        <p className="text-xs mono" style={{ color: 'var(--muted)' }}>Processing…</p>
                        {uploadProgress > 0 && (
                          <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface3)', width: 80 }}>
                            <motion.div animate={{ width: `${uploadProgress}%` }}
                              className="h-full rounded-full" style={{ background: 'var(--accent)' }} />
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-light)' }}>
                        <Upload size={18} style={{ color: 'var(--accent)' }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                          {isDragActive ? 'Drop it!' : 'Drop PDF or Image'}
                        </p>
                        <p className="text-xs mt-0.5 mono" style={{ color: 'var(--muted)' }}>PDF · JPG · PNG · WebP · max 50 MB</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* File list */}
              <div className="flex-1 overflow-y-auto p-4 scrollable">
                {files.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 mt-8 opacity-30">
                    <BookOpen size={28} style={{ color: 'var(--muted)' }} />
                    <p className="text-xs text-center mono" style={{ color: 'var(--muted)' }}>
                      No files yet.<br />Upload a PDF or image.
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs font-semibold tracking-widest uppercase mb-3 mono" style={{ color: 'var(--muted)' }}>
                      Loaded Files
                    </p>
                    <div className="space-y-2">
                      {files.map((f, i) => (
                        <motion.div key={f.docId} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="p-3 rounded-xl flex items-start gap-3"
                          style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ background: 'var(--accent3-light)' }}>
                            {f.name.toLowerCase().endsWith('.pdf')
                              ? <FileText size={14} style={{ color: 'var(--accent3)' }} />
                              : <ImageIcon size={14} style={{ color: 'var(--accent3)' }} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate" style={{ color: 'var(--text)' }} title={f.name}>{f.name}</p>
                            <p className="text-xs mt-0.5 mono" style={{ color: 'var(--muted)' }}>
                              {f.chunks} chunks · {(f.chars / 1000).toFixed(1)}k chars
                            </p>
                          </div>
                          <CheckCircle2 size={13} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} />
                        </motion.div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Feature chips */}
              <div className="p-4 flex-shrink-0 space-y-2" style={{ borderTop: '1px solid var(--border)' }}>
                {[
                  { e: '🚫', t: 'No hallucinations' },
                  { e: '⚡', t: 'Groq ~500 tok/s' },
                  { e: '🇮🇳', t: 'Hindi + English' },
                  { e: '💾', t: 'Local ChromaDB' },
                ].map((x, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-sm">{x.e}</span>
                    <span className="text-xs mono" style={{ color: 'var(--muted)' }}>{x.t}</span>
                  </div>
                ))}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* ── Chat ────────────────────────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          <div ref={chatRef} className="flex-1 overflow-y-auto px-6 py-6 space-y-4 scrollable">

            {/* Empty state */}
            {messages.length === 0 && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center h-full gap-8 text-center">
                <div>
                  <div className="w-20 h-20 mx-auto rounded-3xl flex items-center justify-center mb-5 glow-accent"
                    style={{ background: 'linear-gradient(135deg, var(--accent), #5b4de0)', animation: 'float 3s ease-in-out infinite' }}>
                    <Sparkles size={36} color="white" />
                  </div>
                  <h2 className="text-2xl font-bold">Upload your notes</h2>
                  <p className="text-sm mt-2 max-w-xs mx-auto" style={{ color: 'var(--muted)' }}>
                    PDF ya image upload karo, phir koi bhi sawaal poochho — Hindi ya English mein.
                  </p>
                </div>
                <div>
                  <p className="text-xs mb-3 tracking-widest uppercase mono" style={{ color: 'var(--muted)' }}>Try asking</p>
                  <div className="grid grid-cols-2 gap-2 max-w-lg">
                    {SUGGESTIONS.map((s, i) => (
                      <motion.button key={i}
                        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 + i * 0.07 }}
                        onClick={() => { setInput(s.text); inputRef.current?.focus() }}
                        className="px-3 py-2.5 rounded-xl text-xs text-left transition-all active:scale-95"
                        style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                        <span className="mr-1.5">{s.emoji}</span>{s.text}
                      </motion.button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            <AnimatePresence initial={false}>
              {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
            </AnimatePresence>

            {loading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* ── Input Bar ──────────────────────────────────────── */}
          <div className="flex-shrink-0 px-5 pb-5 pt-3" style={{ borderTop: '1px solid var(--border)' }}>

            {/* Backend offline warning */}
            <AnimatePresence>
              {backendOk === false && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 mb-3 px-4 py-2.5 rounded-xl text-xs mono overflow-hidden"
                  style={{ background: 'var(--danger-light)', border: '1px solid rgba(247,106,106,0.2)', color: 'var(--danger)' }}>
                  <AlertCircle size={13} />
                  Backend offline — run <code className="mx-1 px-1.5 py-0.5 rounded" style={{ background: 'rgba(247,106,106,0.15)' }}>uvicorn main:app --reload</code>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Upload reminder */}
            <AnimatePresence>
              {backendOk && !notesReady && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 mb-3 px-4 py-2.5 rounded-xl text-xs mono overflow-hidden"
                  style={{ background: 'var(--warn-light)', border: '1px solid rgba(247,194,106,0.2)', color: 'var(--warn)' }}>
                  <Info size={13} /> Upload your notes first — then ask anything!
                </motion.div>
              )}
            </AnimatePresence>

            <div className="gradient-border">
              <div className="flex items-end gap-3 px-4 py-3 rounded-[15px]" style={{ background: 'var(--surface)' }}>
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={notesReady ? 'Ask anything… (Hindi ya English)' : 'Upload notes first…'}
                  disabled={!notesReady || loading}
                  className="flex-1 resize-none bg-transparent text-sm outline-none"
                  style={{
                    color: 'var(--text)',
                    fontFamily: 'var(--font-sans)',
                    maxHeight: '120px',
                    lineHeight: '1.6',
                    caretColor: 'var(--accent)',
                    opacity: !notesReady ? 0.4 : 1,
                    transition: 'opacity var(--transition)',
                  }}
                />

                {/* Cancel / Send */}
                {loading ? (
                  <button onClick={cancel} title="Stop generating"
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all active:scale-90 hover:opacity-70"
                    style={{ background: 'var(--danger-light)', border: '1px solid rgba(247,106,106,0.3)' }}>
                    <StopCircle size={15} style={{ color: 'var(--danger)' }} />
                  </button>
                ) : (
                  <button onClick={handleSend}
                    disabled={!input.trim() || !notesReady}
                    title="Send (Enter)"
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
                    style={{
                      background: (input.trim() && notesReady) ? 'var(--accent)' : 'var(--surface2)',
                      opacity: (!input.trim() || !notesReady) ? 0.35 : 1,
                      boxShadow: (input.trim() && notesReady) ? '0 0 16px var(--accent-glow)' : 'none',
                      transition: 'all var(--transition)',
                    }}>
                    <Send size={15} color="white" />
                  </button>
                )}
              </div>
            </div>
            <p className="text-center text-xs mt-2 mono" style={{ color: 'var(--muted)' }}>
              Enter ↵ send · Shift+Enter newline · Answers only from your notes
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}
