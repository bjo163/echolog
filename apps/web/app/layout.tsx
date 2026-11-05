import { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'ECHLOG · Operator Console',
    template: '%s · ECHOLOG',
  },
  description:
    'Operator console for ECHOLOG, the D19 object memory and evidence integrity service of MoonWitness XV.',
  applicationName: 'ECHOLOG',
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#0c0e10',
  colorScheme: 'dark light',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='en'>
      <body>{children}</body>
    </html>
  )
}
