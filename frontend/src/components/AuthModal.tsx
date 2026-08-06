import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Loader2, Mail, Lock, User, ShieldCheck, ShieldAlert } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// Complex Password Strength Calculator
const calculateStrength = (pwd: string) => {
  let score = 0
  if (!pwd) return score
  if (pwd.length > 7) score += 1
  if (pwd.match(/[A-Z]/)) score += 1
  if (pwd.match(/[0-9]/)) score += 1
  if (pwd.match(/[^A-Za-z0-9]/)) score += 1
  return score
}

const getStrengthColor = (score: number) => {
  if (score === 0) return 'bg-gray-700'
  if (score === 1) return 'bg-red-500'
  if (score === 2) return 'bg-orange-500'
  if (score === 3) return 'bg-yellow-400'
  return 'bg-emerald-500'
}

const getStrengthLabel = (score: number) => {
  if (score === 0) return 'Very Weak'
  if (score === 1) return 'Weak'
  if (score === 2) return 'Fair'
  if (score === 3) return 'Good'
  return 'Strong'
}

export function AuthModal() {
  const { login, signup, isLoading, user } = useAuth()
  const [isLogin, setIsLogin] = useState(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [pwdScore, setPwdScore] = useState(0)

  useEffect(() => {
    if (!isLogin) setPwdScore(calculateStrength(password))
  }, [password, isLogin])

  if (isLoading || user) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isLogin && pwdScore < 2) {
      // toast error should be handled globally or here, skipping for brevity
      return
    }
    setLoading(true)
    try {
      if (isLogin) {
        await login(email, password)
      } else {
        await signup(name, email, password)
      }
    } catch (err) {
      // errors handled by toast in context
    } finally {
      setLoading(false)
    }
  }

  const containerVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { 
      opacity: 1, 
      scale: 1,
      transition: { duration: 0.3, staggerChildren: 0.1 }
    },
    exit: { opacity: 0, scale: 0.95 }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="bg-gradient-to-b from-[var(--bg-app)] to-[#181a1f] border border-white/10 p-8 rounded-3xl shadow-2xl max-w-md w-full relative overflow-hidden"
      >
        {/* Background glow */}
        <div className="absolute -top-32 -right-32 w-64 h-64 bg-pink-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-64 h-64 bg-violet-600/20 rounded-full blur-3xl pointer-events-none" />

        <div className="text-center mb-8 relative z-10">
          <motion.div layoutId="logo" className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-pink-500 to-violet-600 flex items-center justify-center font-extrabold text-white shadow-[0_0_20px_rgba(236,72,153,0.4)] mb-5">
            AI
          </motion.div>
          <motion.h2 layout="position" className="text-2xl font-bold text-white tracking-tight">
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </motion.h2>
          <motion.p layout="position" className="text-[var(--text-muted)] text-sm mt-2">
            {isLogin ? 'Sign in to access your intelligent workspace' : 'Join to start analyzing your documents with AI'}
          </motion.p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 relative z-10">
          <AnimatePresence mode="popLayout">
            {!isLogin && (
              <motion.div
                key="name-input"
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 20 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.2 }}
              >
                <div className="relative group">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-pink-400 transition-colors" size={18} />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 text-white pl-11 pr-4 py-3 rounded-xl focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50 transition-all"
                    placeholder="Full Name"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div variants={itemVariants} className="relative group">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-pink-400 transition-colors" size={18} />
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-black/40 border border-white/10 text-white pl-11 pr-4 py-3 rounded-xl focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50 transition-all"
              placeholder="Email Address"
            />
          </motion.div>

          <motion.div variants={itemVariants}>
            <div className="relative group">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-pink-400 transition-colors" size={18} />
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-black/40 border border-white/10 text-white pl-11 pr-4 py-3 rounded-xl focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50 transition-all"
                placeholder="Password"
              />
            </div>
            
            <AnimatePresence>
              {!isLogin && password && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 overflow-hidden"
                >
                  <div className="flex gap-1.5 h-1.5 mb-1.5">
                    {[1, 2, 3, 4].map(idx => (
                      <div key={idx} className={`flex-1 rounded-full transition-colors duration-300 ${pwdScore >= idx ? getStrengthColor(pwdScore) : 'bg-gray-700'}`} />
                    ))}
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-400">Password strength:</span>
                    <span className={`font-medium ${getStrengthColor(pwdScore).replace('bg-', 'text-')}`}>
                      {getStrengthLabel(pwdScore)}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <motion.button
            variants={itemVariants}
            type="submit"
            disabled={loading || (!isLogin && pwdScore < 2 && password.length > 0)}
            className="w-full bg-gradient-to-r from-pink-500 to-violet-600 hover:from-pink-400 hover:to-violet-500 text-white font-semibold py-3 rounded-xl shadow-[0_0_15px_rgba(236,72,153,0.3)] transition-all flex items-center justify-center mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : isLogin ? 'Sign In' : 'Create Account'}
          </motion.button>
        </form>

        <motion.p variants={itemVariants} className="text-center text-sm text-[var(--text-muted)] mt-8 relative z-10">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button 
            onClick={() => setIsLogin(!isLogin)} 
            className="text-white font-semibold hover:text-pink-400 transition-colors"
          >
            {isLogin ? 'Sign up for free' : 'Sign in instead'}
          </button>
        </motion.p>
      </motion.div>
    </div>
  )
}
