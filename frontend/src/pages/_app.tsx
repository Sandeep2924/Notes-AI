import type { AppProps } from 'next/app'
import { Toaster } from 'react-hot-toast'
import '../styles/globals.css'
import { AuthProvider } from '@/hooks/useAuth'
import { AuthModal } from '@/components/AuthModal'

import Head from 'next/head'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AuthProvider>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
      </Head>
      <Component {...pageProps} />
      <AuthModal />
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: 'var(--surface2)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            fontFamily: 'var(--font-sans)',
            fontSize: '14px',
            borderRadius: 'var(--radius-md)',
            backdropFilter: 'blur(10px)',
          },
          success: { 
            iconTheme: { primary: '#00f5a0', secondary: '#05050d' },
            style: { border: '1px solid var(--success-light)' }
          },
          error: { 
            iconTheme: { primary: '#ef4444', secondary: '#05050d' },
            style: { border: '1px solid var(--danger-light)' }
          },
        }}
      />
    </AuthProvider>
  )
}