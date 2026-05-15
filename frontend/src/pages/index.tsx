import { useState, useRef, useEffect, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import ReactMarkdown from 'react-markdown'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, Send, Trash2, BookOpen, Zap, Brain, X,
  FileText, Image as ImageIcon, CheckCircle2, AlertCircle,
  MessageSquare, Sparkles, ChevronDown, RefreshCw, Info,
  Sun, Moon, Globe, Clock, StopCircle, Hash, Loader2, Menu
} from 'lucide-react'
import { useUpload, useChat } from '@/hooks/useNotesAI'
import type { Language } from '@/hooks/useNotesAI'
import { getHealth } from '@/lib/api'

// ── Constants ──────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  { text: 'Summarize my notes', emoji: '📝' },
  { text: 'Key concepts explain karo', emoji: '🔑' },
  { text: 'Explain recursion', emoji: '🔄' },
  { text: 'What is time complexity?', emoji: '⏱️' },
]

const LANG_OPTIONS: { value: Language; label: string; flag: string }[] = [
  { value: 'auto', label: 'Auto', flag: '🌐' },
  { value: 'en', label: 'English', flag: '🇬🇧' },
  { value: 'hi', label: 'हिंदी', flag: '🇮🇳' },
]

// ── Local Sub-Components ───────────────────────────────────────────────────

function StatusDot({ ok }: { ok: boolean | null }) {
  const color = ok === null ? 'var(--muted)' : ok ? 'var(--success)' : 'var(--danger)'
  const label = ok === null ? 'Connecting' : ok ? 'Online' : 'Offline'
  return (
    <div className="chip bg-[var(--surface2)] border-[var(--border)] text-[var(--text-secondary)]">
      <span className="relative flex h-2 w-2">
        {ok && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--success)] opacity-75"></span>}
        <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: color, boxShadow: ok ? `0 0 8px ${color}` : 'none' }}></span>
      </span>
      <span className="hidden xs:inline text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </div>
  )
}

function TypingIndicator() {
  return (
    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex justify-start w-full mb-4">
      <div className="msg-ai px-5 py-4 flex items-center gap-4">
        <div className="w-6 h-6 rounded-lg bg-[var(--surface3)] flex items-center justify-center animate-pulse">
          <Brain size={14} className="text-[var(--accent)]" />
        </div>
        <div className="flex gap-1.5 items-center">
          <span className="w-1.5 h-1.5 rounded-full dot-1 bg-[var(--accent)]" />
          <span className="w-1.5 h-1.5 rounded-full dot-2 bg-[var(--accent2)]" />
          <span className="w-1.5 h-1.5 rounded-full dot-3 bg-[var(--accent3)]" />
          <span className="ml-2 text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">Analyzing...</span>
        </div>
      </div>
    </motion.div>
  )
}

function MessageBubble({ msg }: { msg: any }) {
  const [showSrc, setShowSrc] = useState(false)
  const isUser = msg.role === 'user'
  if (msg.role === 'system') return (
    <div className="flex justify-center my-4 opacity-60"><span className="text-[10px] mono px-3 py-1 border border-[var(--border)] rounded-full uppercase">{msg.text}</span></div>
  )
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${isUser ? 'justify-end' : 'justify-start'} w-full mb-4`}>
      <div className={`${isUser ? 'msg-user' : 'msg-ai'} max-w-[90%] md:max-w-[80%] p-4 md:p-5 relative group`}>
        {!isUser && (
          <div className="flex items-center gap-2 mb-2">
            <div className="w-5 h-5 rounded bg-gradient-to-tr from-[var(--accent)] to-[var(--accent3)] flex items-center justify-center"><Brain size={12} className="text-white" /></div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--accent)]">NotesAI</span>
          </div>
        )}
        <div className={isUser ? 'text-sm text-[var(--text)]' : 'prose-ai'}>
          <ReactMarkdown>{msg.text}</ReactMarkdown>
        </div>
        {!isUser && msg.sources && msg.sources.length > 0 && (
          <div className="mt-4 pt-3 border-t border-[var(--border)]">
            <button onClick={() => setShowSrc(!showSrc)} className="flex items-center gap-2 text-[10px] mono text-[var(--muted)]">
              <MessageSquare size={10} /> {msg.sources.length} REFERENCES <ChevronDown size={10} className={showSrc ? 'rotate-180' : ''} />
            </button>
            <AnimatePresence>
              {showSrc && (
                <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden mt-2 space-y-1">
                  {msg.sources.map((s: string, i: number) => (
                    <div key={i} className="p-2 rounded bg-[var(--accent-light)] text-[10px] text-[var(--text-secondary)]"><b className="text-[var(--accent)]">[{i+1}]</b> {s}</div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </motion.div>
  )
}

function LangSelector({ value, onChange }: { value: Language; onChange: (l: Language) => void }) {
  const [open, setOpen] = useState(false)
  const cur = LANG_OPTIONS.find(o => o.value === value)!
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="chip hover:opacity-80 transition-opacity">
        <Globe size={11} /> <span className="hidden xs:inline">{cur.label}</span> {cur.flag}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            className="absolute top-full right-0 mt-2 z-[100] bg-[var(--surface2)] border border-[var(--border)] rounded-xl shadow-xl overflow-hidden min-w-[120px]">
            {LANG_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false) }}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs hover:bg-[var(--accent-light)] transition-colors">
                <span>{opt.flag} {opt.label}</span>
                {opt.value === value && <CheckCircle2 size={12} className="text-[var(--accent)]" />}
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
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const { uploading, uploadProgress, files, upload, clear: clearFiles } = useUpload()
  const { messages, loading, send, cancel, addSystemMessage, clearMessages } = useChat()

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme) }, [theme])
  useEffect(() => { if (window.innerWidth >= 1024) setSidebarOpen(true) }, [])

  const checkHealth = useCallback(async () => {
    try {
      const h = await getHealth()
      setBackendOk(h.status === 'healthy'); setChunksTotal(h.chunks_stored)
      if (h.model) setModelName(h.model.split('-').slice(0, 3).join('-'))
    } catch { setBackendOk(false) }
  }, [])

  useEffect(() => {
    checkHealth(); const id = setInterval(checkHealth, 25000); return () => clearInterval(id)
  }, [checkHealth])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  const onDrop = useCallback(async (accepted: File[]) => {
    if (!accepted.length) return
    const result = await upload(accepted[0])
    if (result) {
      setChunksTotal(n => n + result.chunks_created)
      addSystemMessage(`**Notes Loaded!** 📚\n\nIndexed **${result.chunks_created}** sections.`)
    }
  }, [upload, addSystemMessage])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.png', '.webp'] }, disabled: uploading,
  })

  const handleSend = () => {
    if (!input.trim() || loading) return
    send(input.trim(), language); setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
  }

  return (
    <div className="app-container noise grid-bg flex flex-col md:flex-row w-full h-screen overflow-hidden">
      
      {/* Sidebar Overlay (Mobile) */}
      <AnimatePresence>
        {sidebarOpen && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSidebarOpen(false)} className="lg:hidden absolute inset-0 bg-black/60 backdrop-blur-sm z-[60]" />}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside initial={false} animate={{ x: sidebarOpen ? 0 : -300, width: sidebarOpen ? 300 : 0 }} className="absolute lg:relative inset-y-0 left-0 z-[70] bg-[var(--surface)] border-r border-[var(--border)] flex flex-col overflow-hidden">
        <div className="p-5 flex items-center justify-between border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-[var(--accent)] to-[var(--accent2)] flex items-center justify-center glow-accent"><Brain size={18} className="text-white" /></div>
            <h1 className="text-sm font-bold tracking-tight">Notes<span className="text-[var(--accent)]">AI</span></h1>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1 text-[var(--muted)]"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollable">
          <div {...getRootProps()} className={`upload-zone rounded-2xl p-6 border-2 border-dashed transition-all ${isDragActive ? 'drag-active' : 'border-[var(--border)] bg-[var(--surface2)]'}`}>
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-2">
              {uploading ? <Loader2 className="animate-spin text-[var(--accent)]" size={20} /> : <Upload size={20} className="text-[var(--accent)]" />}
              <p className="text-[10px] font-bold uppercase tracking-widest">{uploading ? 'Uploading...' : 'Drop Notes'}</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-[var(--muted)] font-bold px-1">Library</p>
            {files.map(f => (
              <div key={f.docId} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--surface2)] border border-[var(--border)]">
                <FileText size={14} className="text-[var(--accent3)]" />
                <span className="text-xs truncate flex-1 text-[var(--text-secondary)]">{f.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-[var(--border)]">
          <button onClick={() => { clearMessages(); clearFiles(); setChunksTotal(0); }} className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-[var(--danger-light)] text-[var(--danger)] text-xs font-bold">
            <Trash2 size={14} /> Clear All
          </button>
        </div>
      </motion.aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-[var(--bg)] relative">
        <header className="flex items-center justify-between p-4 border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-md">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 bg-[var(--surface2)] rounded-lg"><Menu size={18} /></button>
          <div className="flex items-center gap-4">
            <StatusDot ok={backendOk} />
            <div className="hidden sm:flex items-center gap-3">
              <LangSelector value={language} onChange={setLanguage} />
              <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 rounded-lg bg-[var(--surface2)] border border-[var(--border)] text-[var(--accent)]">
                {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scrollable">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <Sparkles size={40} className="text-[var(--accent)] mb-4 opacity-20" />
              <h3 className="text-xl font-bold mb-2">Upload notes to start</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-6">
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} onClick={() => setInput(s.text)} className="p-3 text-left text-xs bg-[var(--surface2)] border border-[var(--border)] rounded-xl hover:border-[var(--accent)] transition-colors">{s.emoji} {s.text}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
              {loading && <TypingIndicator />}
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 md:p-8 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)] to-transparent">
          <div className="max-w-3xl mx-auto">
            <div className="gradient-border glow-accent">
              <div className="flex items-end gap-2 p-2 bg-[var(--surface)] rounded-[calc(var(--radius-lg)-1.5px)]">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'; }}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Ask anything..."
                  className="flex-1 bg-transparent border-0 focus:ring-0 text-sm py-3 px-3 resize-none min-h-[48px]"
                  rows={1}
                />
                <button onClick={loading ? cancel : handleSend} className={`p-3 rounded-xl ${loading ? 'bg-[var(--danger)]' : 'bg-[var(--accent)]'} text-white`}>
                  {loading ? <StopCircle size={20} /> : <Send size={20} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}