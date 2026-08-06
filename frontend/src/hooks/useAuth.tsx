import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { getMe, login as apiLogin, signup as apiSignup } from '@/lib/api'
import toast from 'react-hot-toast'

interface User {
  id: number
  name: string
  email: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  isLoading: boolean
  login: (e: string, p: string) => Promise<void>
  signup: (n: string, e: string, p: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('token')
      if (storedToken) {
        setToken(storedToken)
        try {
          const userData = await getMe()
          setUser(userData)
        } catch (err) {
          console.error('Failed to fetch user', err)
          logout()
        }
      }
      setIsLoading(false)
    }
    initAuth()
  }, [])

  const login = async (email: string, password: string) => {
    try {
      const res = await apiLogin(email, password)
      setToken(res.access_token)
      setUser(res.user)
      localStorage.setItem('token', res.access_token)
      toast.success('Logged in successfully!')
    } catch (err: any) {
      toast.error(err.userMessage || 'Login failed')
      throw err
    }
  }

  const signup = async (name: string, email: string, password: string) => {
    try {
      const res = await apiSignup(name, email, password)
      setToken(res.access_token)
      setUser(res.user)
      localStorage.setItem('token', res.access_token)
      toast.success('Account created successfully!')
    } catch (err: any) {
      toast.error(err.userMessage || 'Signup failed')
      throw err
    }
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('token')
    toast.success('Logged out')
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
