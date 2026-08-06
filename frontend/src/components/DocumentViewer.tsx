import { useEffect } from 'react'

interface DocumentViewerProps {
  docId: string
  title: string
  initialPage?: number
  onPageChange?: (page: number) => void
}

export function DocumentViewer({ docId, title, initialPage = 1, onPageChange }: DocumentViewerProps) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  const pdfUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/documents/${docId}/file${token ? `?token=${encodeURIComponent(token)}` : ''}`

  // We can't track page changes inside a native iframe easily due to cross-origin or plugin boundaries,
  // but we can just render the PDF natively so it loads 100% reliably.

  return (
    <div className="flex flex-col h-full bg-[var(--bg-app)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-color)] bg-[var(--bg-panel)] flex-shrink-0">
        <h2 className="text-sm font-semibold text-white truncate max-w-md">{title}</h2>
        <span className="text-xs text-[var(--text-muted)] bg-[var(--bg-panel-hover)] px-2 py-1 rounded">
          Native Viewer
        </span>
      </div>
      
      <div className="flex-1 w-full bg-[#323639]">
        <iframe 
          src={`${pdfUrl}#page=${initialPage}&view=FitH`} 
          className="w-full h-full border-none"
          title={title}
        />
      </div>
    </div>
  )
}
