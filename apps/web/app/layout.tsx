import type { Metadata } from 'next'
import './globals.css'
export const metadata: Metadata = { title: 'ECHOLOG — Evidence Preservation', description: 'ECHOLOG D19 operator console. Preserve the original. Verify the bytes.', applicationName: 'ECHOLOG' }
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en" suppressHydrationWarning><body>{children}</body></html> }