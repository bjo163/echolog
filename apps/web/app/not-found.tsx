import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="route-fallback">
      <div className="mark">E</div>
      <span className="eyebrow">ECHOLOG / D19</span>
      <h1>That page is not here.</h1>
      <p>The requested workspace path does not exist.</p>
      <Link className="btn primary" href="/">Return to workspace</Link>
    </main>
  )
}
