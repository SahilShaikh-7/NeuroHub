import './globals.css'
import { Toaster } from 'sonner'

export const metadata = {
  title: 'NeuroFlow – Offline AI Adaptive Productivity',
  description: 'Local-first, adaptive productivity OS. Smart priorities, behavior-aware insights, anti-fake activity validation, and a rule-based assistant — no paid AI APIs.',
  manifest: '/manifest.json',
  themeColor: '#a855f7',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <meta name="theme-color" content="#a855f7" />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
        <Toaster theme="dark" position="top-right" richColors />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('/sw.js').catch(function(){});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  )
}
