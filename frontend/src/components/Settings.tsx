import { useState } from 'react'
import { User, Bell, Shield, CreditCard, Palette, Cpu, LogOut, Loader2, Save } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'

const TABS = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'preferences', label: 'Preferences', icon: Palette },
  { id: 'ai', label: 'AI Settings', icon: Cpu },
  { id: 'billing', label: 'Billing', icon: CreditCard },
]

export function Settings() {
  const { user, logout } = useAuth()
  const [activeTab, setActiveTab] = useState('account')
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(user?.name || '')
  
  const handleSave = () => {
    setLoading(true)
    setTimeout(() => {
      setLoading(false)
      toast.success('Settings saved successfully!')
    }, 800)
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--bg-app)] overflow-hidden">
      <header className="h-[60px] px-8 flex items-center border-b border-[var(--border-color)] flex-shrink-0">
        <h2 className="text-xl font-bold text-white tracking-tight">Settings</h2>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r border-[var(--border-color)] p-6 bg-[var(--bg-panel)] flex-shrink-0">
          <nav className="space-y-2">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-sm font-medium ${
                  activeTab === tab.id 
                    ? 'bg-gradient-to-r from-pink-500/10 to-violet-500/10 text-pink-400 border border-pink-500/20' 
                    : 'text-[var(--text-muted)] hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <tab.icon size={18} className={activeTab === tab.id ? 'text-pink-400' : 'opacity-70'} />
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="mt-8 pt-8 border-t border-[var(--border-color)]">
            <button 
              onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-red-400 hover:bg-red-400/10 transition-colors text-sm font-medium"
            >
              <LogOut size={18} />
              Sign Out
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="max-w-2xl"
          >
            {activeTab === 'account' && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">Profile Information</h3>
                  <p className="text-[var(--text-muted)] text-sm mb-6">Update your account details and public profile.</p>
                  
                  <div className="flex items-center gap-6 mb-8">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg">
                      {user?.name?.charAt(0) || 'U'}
                    </div>
                    <button className="px-4 py-2 bg-[var(--bg-panel)] border border-[var(--border-color)] rounded-lg text-sm font-medium text-white hover:border-pink-500/50 transition-colors">
                      Change Avatar
                    </button>
                  </div>

                  <div className="grid gap-5">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Full Name</label>
                      <input 
                        type="text" 
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 text-white px-4 py-2.5 rounded-xl focus:outline-none focus:border-pink-500/50 transition-colors" 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">Email Address</label>
                      <input 
                        type="email" 
                        value={user?.email || ''} 
                        disabled 
                        className="w-full bg-black/20 border border-white/5 text-[var(--text-muted)] px-4 py-2.5 rounded-xl cursor-not-allowed" 
                      />
                      <p className="text-[10px] text-[var(--text-muted)] mt-1.5 ml-1">Email address cannot be changed currently.</p>
                    </div>
                  </div>
                </div>

                <div className="pt-8 border-t border-[var(--border-color)]">
                  <h3 className="text-lg font-bold text-white mb-1">Danger Zone</h3>
                  <p className="text-[var(--text-muted)] text-sm mb-6">Irreversible and destructive actions.</p>
                  
                  <button className="px-5 py-2.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl text-sm font-medium hover:bg-red-500/20 transition-colors">
                    Delete Account & Data
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'preferences' && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">App Preferences</h3>
                  <p className="text-[var(--text-muted)] text-sm mb-6">Customize how NotesAI looks and behaves.</p>
                  
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-white">Dark Mode</h4>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">Toggle the app's visual theme</p>
                      </div>
                      <div className="w-12 h-6 bg-pink-500 rounded-full flex items-center p-1 cursor-pointer">
                        <div className="w-4 h-4 bg-white rounded-full translate-x-6 shadow-sm" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium text-white">Auto-Read Next Page</h4>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">Automatically advance PDF pages in chat</p>
                      </div>
                      <div className="w-12 h-6 bg-pink-500 rounded-full flex items-center p-1 cursor-pointer">
                        <div className="w-4 h-4 bg-white rounded-full translate-x-6 shadow-sm" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'ai' && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">AI & LLM Configuration</h3>
                  <p className="text-[var(--text-muted)] text-sm mb-6">Fine-tune how the AI assistant responds to your queries.</p>
                  
                  <div className="space-y-6">
                    <div>
                      <label className="block text-xs font-medium text-[var(--text-muted)] mb-2">Primary Model</label>
                      <select className="w-full bg-black/40 border border-white/10 text-white px-4 py-3 rounded-xl focus:outline-none appearance-none cursor-pointer">
                        <option>Llama 3.1 (8B Instant) - Lightning Fast</option>
                        <option>Llama 3.1 (70B) - Highly Capable</option>
                        <option>Mixtral 8x7B - Excellent reasoning</option>
                      </select>
                    </div>

                    <div>
                      <label className="flex items-center justify-between text-xs font-medium text-[var(--text-muted)] mb-2">
                        <span>Creativity (Temperature)</span>
                        <span className="text-pink-400">0.2</span>
                      </label>
                      <input type="range" min="0" max="1" step="0.1" defaultValue="0.2" className="w-full accent-pink-500" />
                      <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-1">
                        <span>Precise (Factual)</span>
                        <span>Creative (Brainstorming)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'billing' && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-lg font-bold text-white mb-1">Subscription & Billing</h3>
                  <p className="text-[var(--text-muted)] text-sm mb-6">Manage your plan and usage limits.</p>
                  
                  <div className="bg-gradient-to-br from-pink-500/10 to-violet-600/10 border border-pink-500/20 rounded-2xl p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4">
                      <span className="bg-gradient-to-r from-pink-500 to-violet-500 text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                        Active Plan
                      </span>
                    </div>
                    
                    <h4 className="text-2xl font-bold text-white mb-1">Pro Tier</h4>
                    <p className="text-sm text-pink-300 mb-6">$10.00 / month</p>
                    
                    <div className="space-y-3 mb-8">
                      <div className="flex justify-between text-sm">
                        <span className="text-[var(--text-muted)]">Vector Storage</span>
                        <span className="text-white">45MB / 1GB</span>
                      </div>
                      <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden">
                        <div className="bg-gradient-to-r from-pink-500 to-violet-500 w-[5%] h-full" />
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button className="px-5 py-2.5 bg-white text-black font-semibold rounded-xl text-sm hover:bg-gray-200 transition-colors">
                        Manage Billing
                      </button>
                      <button className="px-5 py-2.5 bg-black/40 text-white font-medium rounded-xl text-sm border border-white/10 hover:bg-black/60 transition-colors">
                        View Invoices
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-10 pt-6 border-t border-[var(--border-color)] flex justify-end">
              <button 
                onClick={handleSave}
                disabled={loading}
                className="flex items-center gap-2 bg-gradient-to-r from-pink-500 to-violet-600 hover:from-pink-400 hover:to-violet-500 text-white px-6 py-2.5 rounded-xl font-medium transition-all shadow-[0_0_15px_rgba(236,72,153,0.3)] disabled:opacity-50"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                Save Changes
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
