import { useState, useRef, useEffect, useCallback } from 'react'
import {
  LayoutDashboard, FolderOpen, Users, Settings, Plus, ChevronDown, ChevronRight,
  Search, Mic, Paperclip, MoreHorizontal, X, Sidebar as SidebarIcon,
  FileText, Loader2, Zap, Trash2, FolderPlus, Folder as FolderIcon,
  ChevronLeft, Clock, BookOpen
} from 'lucide-react'
import { useChat, useUpload, UploadedFile, Folder } from '@/hooks/useNotesAI'
import ReactMarkdown from 'react-markdown'
import { useDropzone } from 'react-dropzone'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'
import dynamic from 'next/dynamic'
import { updateProgress } from '@/lib/api'
import { Settings as SettingsView } from '@/components/Settings'

const DocumentViewer = dynamic(
  () => import('@/components/DocumentViewer').then(mod => mod.DocumentViewer),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center text-[var(--text-muted)] animate-pulse">Loading viewer…</div> }
)

function Avatar({ name }: { name: string }) {
  return (
    <div className="w-7 h-7 rounded-full overflow-hidden bg-gray-600 flex-shrink-0">
      <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`} alt={name} className="w-full h-full object-cover" />
    </div>
  )
}

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'documents', label: 'My Documents', icon: FolderOpen },
  { id: 'study_groups', label: 'Study Groups', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
]

const HIGHLIGHT_COLORS = [
  { id: 'yellow', label: 'Yellow', class: 'bg-yellow-400' },
  { id: 'green', label: 'Green', class: 'bg-green-400' },
  { id: 'blue', label: 'Blue', class: 'bg-blue-400' },
  { id: 'pink', label: 'Pink', class: 'bg-pink-400' },
]

export default function Home() {
  const [input, setInput] = useState('')
  const [activeTab, setActiveTab] = useState('documents')
  const [selectedDoc, setSelectedDoc] = useState<UploadedFile | null>(null)
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set())
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [chatDocId, setChatDocId] = useState<string | undefined>(undefined)
  const [isListening, setIsListening] = useState(false)

  const { user, logout } = useAuth()
  const { uploading, files, folders, upload, fetchDocuments, fetchFolders, addFolder, removeFolder, moveDoc, removeFile } = useUpload()
  const { messages, loading, historyLoaded, send, clearMessages, loadHistory } = useChat()
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (user) {
      fetchDocuments()
      fetchFolders()
    }
  }, [user, fetchDocuments, fetchFolders])

  // Load chat history when doc or folder is selected
  useEffect(() => {
    if (selectedDoc) {
      setChatDocId(selectedDoc.docId)
      setSelectedFolder(null)
      loadHistory(selectedDoc.docId, undefined)
    } else if (selectedFolder) {
      setChatDocId(undefined)
      loadHistory(undefined, selectedFolder.id)
    } else {
      setChatDocId(undefined)
      clearMessages()
    }
  }, [selectedDoc?.docId, selectedFolder?.id])

  const onDrop = useCallback(async (accepted: File[]) => {
    if (!accepted.length) return
    const result = await upload(accepted[0])
    if (result) {
      if (selectedFolder) {
        await moveDoc(result.doc_id, selectedFolder.id)
        fetchDocuments()
      }
      setActiveTab('documents')
      const newFile: UploadedFile = {
        name: result.filename,
        docId: result.doc_id,
        chunks: result.chunks_created,
        chars: result.total_characters,
        uploadedAt: new Date(),
        lastPageRead: 1,
        folderId: selectedFolder ? selectedFolder.id : undefined
      }
      setSelectedDoc(newFile)
    }
  }, [upload, selectedFolder, moveDoc, fetchDocuments])

  const { getRootProps, getInputProps, open } = useDropzone({
    onDrop, noClick: true, noKeyboard: true,
    accept: { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.png', '.webp'], 'text/plain': ['.txt'] },
    disabled: uploading
  })

  const handleSend = () => {
    if (!input.trim() || loading) return
    send(input.trim(), chatDocId, selectedFolder?.id)
    setInput('')
  }

  const handleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error('Voice input is not supported in this browser.')
      return
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    
    recognition.continuous = false
    recognition.interimResults = false
    
    recognition.onstart = () => {
      setIsListening(true)
      toast('Listening...', { icon: '🎤', id: 'voice-toast' })
    }
    
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      setInput(prev => (prev + ' ' + transcript).trim())
    }
    
    recognition.onerror = (event: any) => {
      toast.error('Voice input error: ' + event.error)
      setIsListening(false)
      toast.dismiss('voice-toast')
    }
    
    recognition.onend = () => {
      setIsListening(false)
      toast.dismiss('voice-toast')
    }
    
    recognition.start()
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    await addFolder(newFolderName.trim())
    setNewFolderName('')
    setShowNewFolder(false)
  }

  const toggleFolder = (id: number) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Folder-filtered docs
  const rootDocs = files.filter(f => !f.folderId)
  const recentDocs = [...files].sort((a, b) => {
    const aTime = a.lastOpenedAt ? new Date(a.lastOpenedAt).getTime() : new Date(a.uploadedAt).getTime()
    const bTime = b.lastOpenedAt ? new Date(b.lastOpenedAt).getTime() : new Date(b.uploadedAt).getTime()
    return bTime - aTime
  }).slice(0, 5)

  const renderDocItem = (f: UploadedFile) => (
    <div
      key={f.docId}
      onClick={() => { setSelectedDoc(f); setActiveTab('documents') }}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs truncate group cursor-pointer ${selectedDoc?.docId === f.docId ? 'text-white bg-[var(--bg-panel-hover)]' : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-panel-hover)]'}`}
    >
      <FileText size={13} className="text-blue-400 flex-shrink-0" />
      <span className="truncate flex-1 text-left">{f.name}</span>
      {f.lastPageRead && f.lastPageRead > 1 && (
        <span className="text-[10px] text-[var(--text-muted)] flex-shrink-0">p.{f.lastPageRead}</span>
      )}
      <button
        onClick={e => { e.stopPropagation(); if (confirm('Delete this document?')) removeFile(f.docId).then(ok => { if (ok && selectedDoc?.docId === f.docId) setSelectedDoc(null) }) }}
        className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all flex-shrink-0 p-1"
        aria-label="Delete document"
      >
        <Trash2 size={11} />
      </button>
    </div>
  )

  const renderFolder = (folder: Folder) => {
    const folderDocs = files.filter(f => f.folderId === folder.id)
    const isExpanded = expandedFolders.has(folder.id)
    return (
      <div key={folder.id}>
        <div className="flex items-center gap-1 group">
          <button onClick={() => toggleFolder(folder.id)} className="p-1 text-[var(--text-muted)] hover:text-white transition-colors">
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          <button onClick={() => { setSelectedFolder(folder); setSelectedDoc(null); setActiveTab('documents') }} className={`flex items-center gap-2 flex-1 px-2 py-1.5 rounded-md text-xs transition-colors ${selectedFolder?.id === folder.id ? 'text-white bg-[var(--bg-panel-hover)]' : 'text-[var(--text-muted)] hover:text-white hover:bg-[var(--bg-panel-hover)]'}`}>
            <FolderIcon size={13} className="text-yellow-400 flex-shrink-0" />
            <span className="truncate">{folder.name}</span>
            <span className="text-[10px] text-[var(--text-muted)] ml-auto">{folderDocs.length}</span>
          </button>
          <button
            onClick={() => { if (confirm(`Delete folder "${folder.name}"?`)) removeFolder(folder.id) }}
            className="opacity-0 group-hover:opacity-100 hover:text-red-400 text-[var(--text-muted)] transition-all p-1 flex-shrink-0"
            aria-label={`Delete folder ${folder.name}`}
          >
            <Trash2 size={11} />
          </button>
        </div>
        {isExpanded && (
          <div className="ml-5 pl-2 border-l border-[var(--border-color)] space-y-0.5 mt-0.5">
            {folderDocs.length === 0 ? (
              <p className="text-[10px] text-[var(--text-muted)] px-2 py-1">Empty folder</p>
            ) : folderDocs.map(renderDocItem)}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex w-full h-screen bg-[var(--bg-app)] text-[var(--text-main)] overflow-hidden font-sans">

      {/* 1. Sidebar */}
      <aside className="w-[260px] bg-[var(--bg-sidebar)] flex flex-col border-r border-[var(--border-color)] flex-shrink-0 z-10">
        <div className="p-5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center font-bold text-white shadow-lg shadow-purple-500/20">AI</div>
          <h1 className="text-lg font-bold font-display tracking-tight">NotesAI</h1>
        </div>

        <nav className="px-3 space-y-1 mt-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${activeTab === tab.id ? 'bg-[var(--bg-panel)] text-white' : 'text-[var(--text-muted)] hover:bg-[var(--bg-panel)] hover:text-white'}`}
            >
              <tab.icon size={17} className={activeTab === tab.id && tab.id === 'documents' ? 'text-pink-400' : ''} />
              <span className="font-medium text-sm">{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Documents tree */}
        {activeTab === 'documents' && (
          <div className="flex-1 overflow-y-auto mt-4 px-3 custom-scrollbar">
            {/* Folders header */}
            <div className="flex items-center justify-between px-3 mb-1">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Folders</span>
              <div className="flex items-center gap-1">
                <button onClick={() => setShowNewFolder(!showNewFolder)} className="text-[var(--text-muted)] hover:text-white p-1 rounded" title="New folder" aria-label="New folder">
                  <FolderPlus size={14} />
                </button>
              </div>
            </div>

            {showNewFolder && (
              <div className="flex items-center gap-1 mb-2 px-1">
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName('') } }}
                  placeholder="Folder name…"
                  className="flex-1 bg-[var(--bg-panel)] border border-[var(--border-color)] rounded px-2 py-1 text-xs text-white outline-none focus:border-pink-500"
                />
                <button onClick={handleCreateFolder} className="text-pink-400 hover:text-pink-300 px-1">✓</button>
              </div>
            )}

            <div className="space-y-0.5 mb-3">
              {folders.map(renderFolder)}
              {folders.length === 0 && (
                <p className="text-[10px] text-[var(--text-muted)] px-3 py-1">No folders yet. Click + to create one.</p>
              )}
            </div>

            {/* All docs (unfiled) */}
            <div className="flex items-center justify-between px-3 mb-1 mt-3">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">All Documents</span>
              <button onClick={open} className="text-[var(--text-muted)] hover:text-white p-1 rounded" disabled={uploading} title="Upload">
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              </button>
            </div>

            <div className="space-y-0.5">
              {files.length === 0 ? (
                <p className="text-[10px] text-[var(--text-muted)] px-3 py-2">No documents yet. Click + to upload.</p>
              ) : files.map(renderDocItem)}
            </div>
          </div>
        )}

        {/* User footer */}
        <div className="p-4 mt-auto border-t border-[var(--border-color)]">
          {user ? (
            <div className="flex items-center justify-between px-2 py-2 rounded-lg hover:bg-[var(--bg-panel)] transition-colors cursor-pointer group">
              <div className="flex items-center gap-2.5">
                <Avatar name={user.name} />
                <span className="text-sm font-medium text-white truncate max-w-[100px]">{user.name}</span>
              </div>
              <button onClick={logout} className="text-[var(--text-muted)] hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all" title="Logout">
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="text-sm text-[var(--text-muted)] px-3 text-center">Not logged in</div>
          )}
        </div>
      </aside>

      {/* 2. Main Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-[var(--bg-app)]" {...getRootProps()}>
        <input {...getInputProps()} />

        {activeTab === 'dashboard' ? (
          /* ── Dashboard ── */
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <h2 className="text-2xl font-bold text-white mb-1">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {user?.name?.split(' ')[0] ?? 'there'} 👋</h2>
            <p className="text-[var(--text-muted)] mb-8 text-sm">Here's what you've been working on.</p>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              {[
                { icon: FileText, label: 'Total Documents', value: files.length, color: 'text-blue-400' },
                { icon: FolderIcon, label: 'Folders', value: folders.length, color: 'text-yellow-400' },
                { icon: BookOpen, label: 'Recently Opened', value: recentDocs.length, color: 'text-pink-400' },
              ].map(stat => (
                <div key={stat.label} className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl p-5 flex items-center gap-4">
                  <div className={`${stat.color} opacity-80`}><stat.icon size={28} /></div>
                  <div>
                    <p className="text-2xl font-bold text-white">{stat.value}</p>
                    <p className="text-xs text-[var(--text-muted)]">{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Recent Docs */}
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Clock size={14} className="text-[var(--text-muted)]" /> Recently Opened
            </h3>
            {recentDocs.length === 0 ? (
              <div className="bg-[var(--bg-panel)] border border-dashed border-[var(--border-color)] rounded-xl p-8 text-center">
                <FileText size={36} className="text-[var(--text-muted)] mx-auto mb-3 opacity-30" />
                <p className="text-sm text-[var(--text-muted)]">No documents yet. Switch to <b className="text-white">My Documents</b> and upload your first PDF!</p>
                <button onClick={() => setActiveTab('documents')} className="mt-4 bg-pink-500 hover:bg-pink-400 text-white rounded-lg px-5 py-2 text-sm transition-colors font-medium">Upload a PDF</button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {recentDocs.map(f => (
                  <button
                    key={f.docId}
                    onClick={() => { setSelectedDoc(f); setActiveTab('documents') }}
                    className="bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-xl p-4 text-left hover:border-pink-500/50 hover:shadow-lg hover:shadow-pink-500/5 transition-all group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                        <FileText size={16} className="text-blue-400" />
                      </div>
                      {f.lastPageRead && f.lastPageRead > 1 && (
                        <span className="text-[10px] bg-[var(--bg-app)] text-[var(--text-muted)] px-2 py-0.5 rounded-full border border-[var(--border-color)]">
                          p.{f.lastPageRead}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-white truncate group-hover:text-pink-300 transition-colors">{f.name}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">{f.chunks} sections · {(f.chars / 1000).toFixed(1)}k chars</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'documents' ? (
          /* ── Document Reader ── */
          <>
            <header className="h-[60px] px-6 flex items-center justify-between border-b border-[var(--border-color)] flex-shrink-0 bg-[var(--bg-app)]">
              <div className="truncate max-w-xl pr-4">
                <h2 className="text-sm font-semibold text-white truncate">
                  {selectedDoc ? selectedDoc.name : selectedFolder ? selectedFolder.name : 'No document selected'}
                </h2>
                <p className="text-xs text-[var(--text-muted)] truncate">
                  {selectedDoc
                    ? `${selectedDoc.chunks} sections · ${(selectedDoc.chars / 1000).toFixed(1)}k chars${selectedDoc.lastPageRead && selectedDoc.lastPageRead > 1 ? ` · Last on p.${selectedDoc.lastPageRead}` : ''}`
                    : selectedFolder
                    ? `Folder with ${files.filter(f => f.folderId === selectedFolder.id).length} documents`
                    : 'Select a document from the sidebar or upload one'}
                </p>
              </div>
              <div className="flex items-center gap-3 text-[var(--text-muted)] flex-shrink-0">
                {selectedDoc && (
                  <button
                    onClick={async () => { if (confirm('Delete this document?')) { const ok = await removeFile(selectedDoc.docId); if (ok) setSelectedDoc(null) } }}
                    className="hover:text-red-400 transition-colors p-1.5 hover:bg-red-400/10 rounded-md"
                    title="Delete Document"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                <div className="flex items-center gap-2 bg-[var(--bg-panel)] px-3 py-1.5 rounded-md border border-[var(--border-color)] focus-within:border-[var(--accent-pink)] transition-colors">
                  <Search size={14} />
                  <input type="text" placeholder="Search" className="bg-transparent border-none outline-none text-xs w-24 text-white placeholder-gray-500" />
                </div>
              </div>
            </header>

            <div className="bg-[var(--bg-panel)] m-4 rounded-xl flex-1 flex flex-col border border-[var(--border-color)] overflow-hidden shadow-lg shadow-black/20 min-h-0">
              {selectedDoc ? (
                <DocumentViewer
                  docId={selectedDoc.docId}
                  title={selectedDoc.name}
                  initialPage={selectedDoc.lastPageRead || 1}
                  onPageChange={(page) => updateProgress(selectedDoc.docId, page).catch(() => {})}
                />
              ) : selectedFolder ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[var(--bg-app)] rounded-xl">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-yellow-500/20 to-orange-600/20 flex items-center justify-center mb-4 border border-yellow-500/20">
                    <FolderIcon size={36} className="text-yellow-400 opacity-70" />
                  </div>
                  <h2 className="text-xl font-bold text-white mb-2">Folder: {selectedFolder.name}</h2>
                  <p className="text-[var(--text-muted)] max-w-sm text-sm mb-5">
                    You can now chat with all the documents inside this folder at once using the AI chat panel on the right.
                  </p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[var(--bg-app)] rounded-xl">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-pink-500/20 to-violet-600/20 flex items-center justify-center mb-4 border border-pink-500/20">
                    <FileText size={36} className="text-pink-400 opacity-70" />
                  </div>
                  <h2 className="text-xl font-bold text-white mb-2">No Document Selected</h2>
                  <p className="text-[var(--text-muted)] max-w-sm text-sm mb-5">
                    Select a document or folder from the sidebar, or upload a new PDF to get started.
                  </p>
                  <button onClick={open} disabled={uploading} className="bg-pink-500 hover:bg-pink-400 text-white rounded-lg px-6 py-2.5 font-medium transition-colors flex items-center gap-2 text-sm">
                    {uploading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Upload PDF
                  </button>
                </div>
              )}
            </div>
          </>
        ) : activeTab === 'settings' ? (
          <SettingsView />
        ) : (
          /* ── Placeholder ── */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <Zap size={48} className="text-[var(--text-muted)] mb-4 opacity-30" />
            <h2 className="text-2xl font-bold text-white mb-2 capitalize">{activeTab.replace('_', ' ')}</h2>
            <p className="text-[var(--text-muted)] max-w-sm">Coming soon! This feature is in development.</p>
            <button onClick={() => setActiveTab('documents')} className="mt-6 bg-pink-500 hover:bg-pink-400 text-white rounded-lg px-6 py-2 transition-colors font-medium">
              Go to My Documents
            </button>
          </div>
        )}
      </main>

      {/* 3. AI Chat Pane */}
      <aside className="w-[340px] bg-[var(--bg-app)] border-l border-[var(--border-color)] flex flex-col flex-shrink-0 z-10">
        <header className="h-[60px] px-4 flex items-center justify-between border-b border-[var(--border-color)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center font-bold text-[10px] text-white">AI</div>
            <div>
              <p className="font-medium text-sm text-white leading-tight">NotesAI Assistant</p>
              {selectedDoc && (
                <p className="text-[10px] text-pink-400 truncate max-w-[180px]">{selectedDoc.name}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 text-[var(--text-muted)] flex-shrink-0">
            <MoreHorizontal size={16} className="cursor-pointer hover:text-white" />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
          {!historyLoaded && selectedDoc ? (
            <div className="flex items-center justify-center flex-1 text-[var(--text-muted)] text-sm animate-pulse">Loading history…</div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 text-center p-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500/20 to-violet-600/20 flex items-center justify-center mb-3 border border-pink-500/20">
                <span className="text-lg">✨</span>
              </div>
              <p className="text-sm font-medium text-white mb-1">Ask me anything!</p>
              <p className="text-xs text-[var(--text-muted)] max-w-[200px]">
                {selectedDoc ? `I'm ready to answer questions about "${selectedDoc.name}"` : 'Select a document first, then ask questions about it.'}
              </p>
              {selectedDoc && (
                <div className="mt-4 space-y-2 w-full">
                  {['Summarize this document', 'What are the key points?', 'Explain the main concepts'].map(q => (
                    <button
                      key={q}
                      onClick={() => { send(q, chatDocId); }}
                      className="w-full text-xs text-left px-3 py-2 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-color)] text-[var(--text-muted)] hover:text-white hover:border-pink-500/50 transition-colors"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mb-1`}>
                {msg.role === 'ai' && (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center font-bold text-[10px] text-white flex-shrink-0 mr-2 mt-1">AI</div>
                )}
                <div className={`${msg.role === 'user' ? 'bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-2xl rounded-tr-sm px-4 py-3 max-w-[85%]' : 'max-w-[88%]'} text-sm text-[var(--text-main)]`}>
                  {msg.role === 'ai'
                    ? <ReactMarkdown className="prose-ai">{msg.text}</ReactMarkdown>
                    : <span>{msg.text}</span>
                  }
                  {msg.role === 'ai' && msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[var(--border-color)]">
                      <p className="text-[10px] text-[var(--text-muted)] uppercase font-semibold tracking-wider mb-1.5">Sources</p>
                      <div className="space-y-1">
                        {msg.sources.slice(0, 2).map((src, i) => (
                          <div key={i} className="text-[10px] bg-[var(--bg-panel-hover)] px-2 py-1.5 rounded text-[var(--text-muted)] line-clamp-2">
                            [{i + 1}] {src}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {msg.role === 'user' && <div className="ml-2 mt-1 flex-shrink-0"><Avatar name={user?.name ?? 'U'} /></div>}
              </div>
            ))
          )}
          {loading && (
            <div className="flex justify-start mb-1">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center font-bold text-[10px] text-white flex-shrink-0 mr-2 mt-1">AI</div>
              <div className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] mt-1">
                <div className="w-1.5 h-1.5 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-pink-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 bg-[var(--bg-app)] border-t border-[var(--border-color)]">
          <div className="bg-[var(--bg-panel)] rounded-xl border border-[var(--border-color)] flex flex-col overflow-hidden focus-within:border-[var(--accent-pink)] transition-colors">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder={selectedDoc ? `Ask about "${selectedDoc.name}"…` : 'Select a document first…'}
              className="bg-transparent border-none text-sm text-white placeholder-gray-500 p-3 outline-none resize-none min-h-[44px] max-h-[120px]"
              rows={1}
            />
            <div className="flex items-center justify-between px-3 pb-2 pt-1">
              <div className="flex items-center gap-1 text-[var(--text-muted)]">
                <button 
                  onClick={handleVoiceInput}
                  className={`p-1.5 rounded-md transition-colors ${isListening ? 'text-pink-500 bg-pink-500/10' : 'hover:text-white hover:bg-[var(--bg-panel-hover)]'}`} 
                  title="Voice Input"
                  aria-label="Voice Input"
                >
                  <Mic size={15} className={isListening ? 'animate-pulse' : ''} />
                </button>
                <button className="p-1.5 hover:text-white hover:bg-[var(--bg-panel-hover)] rounded-md transition-colors" title="Attach File" aria-label="Attach File" onClick={open}>
                  <Paperclip size={15} />
                </button>
              </div>
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="bg-pink-500 hover:bg-pink-400 text-white rounded-lg px-4 py-1.5 flex items-center justify-center transition-colors disabled:opacity-50 text-sm font-semibold"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}