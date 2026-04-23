import './globals.css'
import { Toaster } from 'sonner'

export const metadata = {
  title: 'NeuroFlow – Offline AI Adaptive Productivity',
  description: 'Your local-first, adaptive productivity OS. Smart priorities, behavior-aware insights, and a rule-based assistant.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
        <Toaster theme="dark" position="top-right" richColors />
      </body>
    </html>
  )
}
