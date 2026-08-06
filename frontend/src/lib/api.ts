import axios, { AxiosError } from 'axios'

// ── Client ────────────────────────────────────────────────────────────────

// FIX 1: Explicitly use the env variable, fallback to localhost for local dev.
// This prevents Next.js from routing to a dead '/api' endpoint on Vercel.
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  timeout: 90_000,
})

// ── Request Interceptor: inject token ──────────────────────────────────────

api.interceptors.request.use(config => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

// ── Response Interceptor: normalise errors ────────────────────────────────

api.interceptors.response.use(
  res => res,
  (err: AxiosError<{ detail?: string | { msg: string }[] }>) => {
    const raw = err.response?.data?.detail
    let message = 'An unexpected error occurred.'

    if (typeof raw === 'string') {
      message = raw
    } else if (Array.isArray(raw)) {
      message = raw.map(e => e.msg).join('; ')
    } else if (err.code === 'ECONNABORTED') {
      message = 'Request timed out — the backend may be waking up from a cold start.'
    } else if (!err.response) {
      // FIX 2: Updated this message so it makes sense in production (Vercel)
      message = 'Cannot reach backend. Please verify your Render URL in Vercel Environment Variables.'
    }

    // Attach a human-readable message to the error object
    ;(err as ApiError).userMessage = message
    return Promise.reject(err)
  }
)

export type ApiError = AxiosError & { userMessage: string }

// ── Types ──────────────────────────────────────────────────────────────────

export interface UploadResponse {
  success: boolean
  filename: string
  doc_id: string
  chunks_created: number
  total_characters: number
  preview: string
}

export interface ChatRequest {
  question: string
  language?: 'auto' | 'en' | 'hi'
}

export interface ChatResponse {
  answer: string
  sources: string[]
  chunks_used: number
  latency_ms?: number
}

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'error'
  chunks_stored: number
  groq_configured: boolean
  model: string
  version?: string
}

export interface StatsResponse {
  chunks_stored: number
  ready: boolean
  files_uploaded?: number
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Simple retry wrapper for transient failures */
async function withRetry<T>(fn: () => Promise<T>, retries = 2, delayMs = 800): Promise<T> {
  let last: unknown
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      last = err
      const isRetryable =
        (err as AxiosError).code !== 'ERR_BAD_REQUEST' &&
        (err as AxiosError).response?.status !== 422 &&
        i < retries
      if (!isRetryable) break
      await new Promise(r => setTimeout(r, delayMs * (i + 1)))
    }
  }
  throw last
}

// ── API Calls ──────────────────────────────────────────────────────────────

export const uploadNotes = async (
  file: File,
  onProgress?: (pct: number) => void
): Promise<UploadResponse> => {
  const form = new FormData()
  form.append('file', file)
  const res = await api.post<UploadResponse>('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: e => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
    },
  })
  return res.data
}

export const sendChat = async (
  payload: ChatRequest,
  signal?: AbortSignal
): Promise<ChatResponse> =>
  withRetry(async () => {
    const res = await api.post<ChatResponse>('/chat', payload, { signal })
    return res.data
  })

export const getHealth = async (): Promise<HealthResponse> => {
  const res = await api.get<HealthResponse>('/health', { timeout: 35_000 }) // 35s for cold start
  return res.data
}

export const getStats = async (): Promise<StatsResponse> => {
  const res = await api.get<StatsResponse>('/stats', { timeout: 35_000 }) // 35s for cold start
  return res.data
}

export const clearNotes = async (): Promise<void> => {
  await api.delete('/clear')
}

// ── Auth & Document Calls ──────────────────────────────────────────────────

export const login = async (email: string, password: string) => {
  const form = new URLSearchParams()
  form.append('username', email)
  form.append('password', password)
  const res = await api.post('/login', form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  })
  return res.data
}

export const signup = async (name: string, email: string, password: string) => {
  const res = await api.post('/signup', { name, email, password })
  return res.data
}

export const getMe = async () => {
  const res = await api.get('/me')
  return res.data
}

export const getDocuments = async () => {
  const res = await api.get('/documents')
  return res.data
}

export const getAnnotations = async (docId: string) => {
  const res = await api.get(`/documents/${docId}/annotations`)
  return res.data
}

export const saveAnnotation = async (docId: string, annotation: any) => {
  const res = await api.post(`/documents/${docId}/annotations`, annotation)
  return res.data
}

export const deleteDocument = async (docId: string) => {
  const res = await api.delete(`/documents/${docId}`)
  return res.data
}

// ── Folders ────────────────────────────────────────────────────────────────

export const getFolders = async () => {
  const res = await api.get('/folders')
  return res.data
}

export const createFolder = async (name: string, parentId?: number) => {
  const res = await api.post('/folders', { name, parent_id: parentId })
  return res.data
}

export const renameFolder = async (folderId: number, name: string) => {
  const res = await api.patch(`/folders/${folderId}`, { name })
  return res.data
}

export const deleteFolder = async (folderId: number) => {
  const res = await api.delete(`/folders/${folderId}`)
  return res.data
}

export const moveDocument = async (docId: string, folderId: number | null) => {
  const res = await api.patch(`/documents/${docId}/move`, { folder_id: folderId })
  return res.data
}

export const updateProgress = async (docId: string, lastPage: number) => {
  await api.patch(`/documents/${docId}/progress`, { last_page_read: lastPage })
}

// ── Chat History ────────────────────────────────────────────────────────────

export const getChatHistory = async (docId: string) => {
  const res = await api.get(`/documents/${docId}/chat`)
  return res.data
}

export const getFolderChatHistory = async (folderId: number) => {
  const res = await api.get(`/folders/${folderId}/chat`)
  return res.data
}

// ── Annotations ────────────────────────────────────────────────────────────

export const deleteAnnotation = async (docId: string, annId: number) => {
  const res = await api.delete(`/documents/${docId}/annotations/${annId}`)
  return res.data
}

export const updateAnnotation = async (docId: string, annId: number, data: { comment?: string; color?: string }) => {
  const res = await api.patch(`/documents/${docId}/annotations/${annId}`, data)
  return res.data
}

export default api