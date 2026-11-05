import { notFound } from 'next/navigation'
import EchologConsole from '../../page'

export default async function ObjectDetailRoute({ params }: { params: Promise<{ digest: string }> }) {
  const { digest } = await params
  if (!/^[a-f0-9]{64}$/.test(digest)) notFound()
  return <EchologConsole />
}
