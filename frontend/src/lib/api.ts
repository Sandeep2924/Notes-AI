import axios, { AxiosError } from 'axios'

// ── Client ────────────────────────────────────────────────────────────────

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL}`
    : '/api',
  timeout: 90_000,
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
      message = 'Request timed out — the backend may be overloaded.'
    } else if (!err.response) {
      message = 'Cannot reach backend. Is it running on port 8000?'
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

export default api
