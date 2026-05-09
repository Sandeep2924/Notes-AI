import type { AppProps } from 'next/app'
import { Toaster } from 'react-hot-toast'
import '@/styles/globals.css'

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#1a1a25',
            color: '#e8e8f0',
            border: '1px solid #2a2a3d',
            fontFamily: 'Syne, sans-serif',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#6af7c8', secondary: '#0a0a0f' } },
          error: { iconTheme: { primary: '#f76a6a', secondary: '#0a0a0f' } },
        }}
      />
    </>
  )
}
