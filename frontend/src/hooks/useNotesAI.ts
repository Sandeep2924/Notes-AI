import { useState, useCallback, useRef } from 'react'
import toast from 'react-hot-toast'
import {
  uploadNotes, clearNotes, getDocuments, deleteDocument,
  getFolders, createFolder, renameFolder as apiFolderRename, deleteFolder, moveDocument, getChatHistory, getFolderChatHistory,
} from '@/lib/api'
import type { UploadResponse, ApiError } from '@/lib/api'

// ── Types ──────────────────────────────────────────────────────────────────

export type Language = 'auto' | 'en' | 'hi'

export interface UploadedFile {
  name: string
  docId: string
  chunks: number
  chars: number
  uploadedAt: Date
  lastOpenedAt?: Date
  lastPageRead?: number
  folderId?: number | null
  preview?: string
}

export interface Folder {
  id: number
  name: string
  parentId: number | null
  createdAt: Date
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
  const [folders, setFolders] = useState<Folder[]>([])

  const upload = useCallback(async (file: File): Promise<UploadResponse | null> => {
    setUploading(true)
    setUploadProgress(0)
    const toastId = toast.loading(`Reading "${file.name}"…`)
    try {
      const data = await uploadNotes(file, pct => setUploadProgress(pct))
      setFiles(prev => {
        if (prev.some(f => f.docId === data.doc_id)) return prev
        return [{
          name: data.filename, docId: data.doc_id, chunks: data.chunks_created,
          chars: data.total_characters, uploadedAt: new Date(), lastPageRead: 1, folderId: null,
          preview: data.preview,
        }, ...prev]
      })
      toast.success(`✅ ${data.chunks_created} sections indexed from "${data.filename}"`, { id: toastId, duration: 4000 })
      return data
    } catch (err) {
      toast.error((err as ApiError).userMessage ?? 'Upload failed.', { id: toastId, duration: 5000 })
      return null
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }, [])

  const fetchDocuments = useCallback(async () => {
    try {
      const docs = await getDocuments()
      setFiles(docs || [])
    } catch (e: any) {
      console.error('Failed to fetch documents:', e)
      toast.error('Could not load documents from database. Check backend connection.')
    }
  }, [])

  const fetchFolders = useCallback(async () => {
    try {
      const f = await getFolders()
      setFolders(f || [])
    } catch (e: any) {
      console.error('Failed to fetch folders:', e)
    }
  }, [])


  const addFolder = useCallback(async (name: string, parentId?: number) => {
    try {
      const f = await createFolder(name, parentId)
      setFolders(prev => [...prev, f])
      toast.success(`Folder "${name}" created`)
      return f
    } catch { toast.error('Failed to create folder'); return null }
  }, [])

  const removeFolder = useCallback(async (folderId: number) => {
    try {
      await deleteFolder(folderId)
      setFolders(prev => prev.filter(f => f.id !== folderId))
      setFiles(prev => prev.map(f => f.folderId === folderId ? { ...f, folderId: null } : f))
      toast.success('Folder deleted')
    } catch { toast.error('Failed to delete folder') }
  }, [])

  const renameF = useCallback(async (folderId: number, name: string) => {
    try {
      await apiFolderRename(folderId, name)
      setFolders(prev => prev.map(f => f.id === folderId ? { ...f, name } : f))
    } catch { toast.error('Failed to rename folder') }
  }, [])

  const moveDoc = useCallback(async (docId: string, folderId: number | null) => {
    try {
      await moveDocument(docId, folderId)
      setFiles(prev => prev.map(f => f.docId === docId ? { ...f, folderId } : f))
    } catch { toast.error('Failed to move document') }
  }, [])

  const removeFile = useCallback(async (docId: string) => {
    try {
      await deleteDocument(docId)
      toast.success('Document deleted')
      setFiles(prev => prev.filter(f => f.docId !== docId))
      return true
    } catch { toast.error('Failed to delete document'); return false }
  }, [])

  const clear = useCallback(async () => {
    try { await clearNotes(); setFiles([]); toast.success('Notes cleared.') }
    catch { toast.error('Could not clear notes — try again.') }
  }, [])

  return { uploading, uploadProgress, files, folders, upload, clear, fetchDocuments, fetchFolders, addFolder, removeFolder, renameFolder: renameF, moveDoc, removeFile }
}

// ── useChat ────────────────────────────────────────────────────────────────

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const loadHistory = useCallback(async (docId?: string, folderId?: number) => {
    try {
      let history = []
      if (folderId) {
        history = await getFolderChatHistory(folderId)
      } else if (docId) {
        history = await getChatHistory(docId)
      }
      setMessages(history.length > 0 ? history.map((m: any) => ({
        id: String(m.id), role: m.role, text: m.text,
        sources: m.sources, timestamp: new Date(m.timestamp)
      })) : [])
    } catch { setMessages([]) }
    setHistoryLoaded(true)
  }, [])

  const addMessage = useCallback((msg: Omit<Message, 'id' | 'timestamp'>) => {
    const full: Message = { ...msg, id: `${Date.now()}-${Math.random()}`, timestamp: new Date() }
    setMessages(prev => [...prev, full])
    return full
  }, [])

  const send = useCallback(async (question: string, activeDocId?: string, activeFolderId?: number) => {
    if (!question.trim() || loading) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    addMessage({ role: 'user', text: question })
    
    // Add an empty AI message that we will progressively fill
    const aiMsgId = `${Date.now()}-${Math.random()}`
    setMessages(prev => [...prev, { id: aiMsgId, role: 'ai', text: '', timestamp: new Date() }])
    
    setLoading(true)
    try {
      const t0 = Date.now()
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ question, doc_id: activeDocId ?? null, folder_id: activeFolderId ?? null }),
        signal: ctrl.signal,
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Error')
      }
      
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let done = false
      
      while (reader && !done) {
        const { value, done: doneReading } = await reader.read()
        done = doneReading
        if (value) {
          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6)
              if (dataStr === '[DONE]') {
                done = true
                break
              }
              
              try {
                const data = JSON.parse(dataStr)
                if (data.type === 'metadata') {
                  setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, sources: data.sources, chunks: data.chunks_used } : m))
                } else if (data.type === 'chunk') {
                  setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: m.text + data.text } : m))
                } else if (data.type === 'error') {
                  throw new Error(data.text)
                }
              } catch (e) {
                console.error("Error parsing stream chunk", e, dataStr)
              }
            }
          }
        }
      }
      
      // Update latency when done
      setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, latency: Date.now() - t0 } : m))
      
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return
      const detail = (err as Error).message ?? 'Something went wrong.'
      setMessages(prev => prev.map(m => m.role === 'ai' && m.text === '' ? { ...m, text: `⚠️ **Error:** ${detail}`, error: true } : m))
      toast.error(detail, { duration: 5000 })
    } finally { setLoading(false) }
  }, [loading, addMessage])

  const cancel = useCallback(() => { abortRef.current?.abort(); setLoading(false) }, [])
  const clearMessages = useCallback(() => { setMessages([]); setHistoryLoaded(false) }, [])

  return { messages, loading, historyLoaded, send, cancel, clearMessages, loadHistory }
}
