import { useState, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import { uploadNotes, sendChat, clearNotes } from '@/lib/api'
import type { UploadResponse, ChatResponse, ApiError } from '@/lib/api'

// ── Types ──────────────────────────────────────────────────────────────────

export type Language = 'auto' | 'en' | 'hi'

export interface UploadedFile {
  name: string
  docId: string
  chunks: number
  chars: number
  uploadedAt: Date
}

export interface Message {
  id: string
  role: 'user' | 'ai' | 'system'
  text: string
  sources?: string[]
  chunks?: number
  latency?: number
  timestamp: Date
  error?: boolean
}

// ── useUpload ──────────────────────────────────────────────────────────────

export function useUpload() {
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [files, setFiles] = useState<UploadedFile[]>([])

  const upload = useCallback(async (file: File): Promise<UploadResponse | null> => {
    setUploading(true)
    setUploadProgress(0)

    const toastId = toast.loading(`Reading "${file.name}"…`)
    try {
      const data = await uploadNotes(file, pct => setUploadProgress(pct))

      setFiles(prev => {
        // Avoid duplicates by doc_id
        const exists = prev.some(f => f.docId === data.doc_id)
        if (exists) return prev
        return [...prev, {
          name: data.filename,
          docId: data.doc_id,
          chunks: data.chunks_created,
          chars: data.total_characters,
          uploadedAt: new Date(),
        }]
      })

      toast.success(
        `✅ ${data.chunks_created} sections indexed from "${data.filename}"`,
        { id: toastId, duration: 4000 }
      )
      return data
    } catch (err) {
      const msg = (err as ApiError).userMessage ?? 'Upload failed.'
      toast.error(msg, { id: toastId, duration: 5000 })
      return null
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }, [])

  const clear = useCallback(async () => {
    try {
      await clearNotes()
      setFiles([])
      toast.success('Notes cleared.')
    } catch {
      toast.error('Could not clear notes — try again.')
    }
  }, [])

  return { uploading, uploadProgress, files, upload, clear }
}

// ── useChat ────────────────────────────────────────────────────────────────

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const addMessage = useCallback((msg: Omit<Message, 'id' | 'timestamp'>) => {
    const full: Message = { ...msg, id: `${Date.now()}-${Math.random()}`, timestamp: new Date() }
    setMessages(prev => [...prev, full])
    return full
  }, [])

  const send = useCallback(async (question: string, language: Language = 'auto') => {
    if (!question.trim() || loading) return

    // Cancel any in-flight request
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    addMessage({ role: 'user', text: question })
    setLoading(true)

    try {
      const t0 = Date.now()
      const data: ChatResponse = await sendChat({ question, language }, ctrl.signal)

      addMessage({
        role: 'ai',
        text: data.answer,
        sources: data.sources,
        chunks: data.chunks_used,
        latency: data.latency_ms ?? Date.now() - t0,
      })
    } catch (err: unknown) {
      // Ignore aborts — they're intentional
      if ((err as Error)?.name === 'CanceledError') return

      const detail = (err as ApiError).userMessage ?? 'Something went wrong.'
      addMessage({
        role: 'ai',
        text: `⚠️ **Error:** ${detail}`,
        error: true,
      })
      toast.error(detail, { duration: 5000 })
    } finally {
      setLoading(false)
    }
  }, [loading, addMessage])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setLoading(false)
  }, [])

  const addSystemMessage = useCallback((text: string) => {
    addMessage({ role: 'system', text })
  }, [addMessage])

  const clearMessages = useCallback(() => setMessages([]), [])

  return { messages, loading, send, cancel, addSystemMessage, clearMessages }
}
