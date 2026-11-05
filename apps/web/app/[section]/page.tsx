import { notFound } from 'next/navigation'
import EchologConsole from '../page'

const sections = ['overview', 'objects', 'deposit', 'integrity', 'retention', 'storage', 'access', 'activity', 'settings'] as const

export const dynamicParams = false

export function generateStaticParams() {
  return sections.map((section) => ({ section }))
}

export default async function SectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params
  if (!sections.includes(section as (typeof sections)[number])) notFound()
  return <EchologConsole />
}
