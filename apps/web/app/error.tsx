'use client'

export default function ErrorBoundary({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="route-fallback" role="alert">
      <div className="mark">E</div>
      <span className="eyebrow">ECHOLOG / D19</span>
      <h1>Workspace interrupted.</h1>
      <p>The page could not be rendered. Your stored objects are not affected by this display error.</p>
      <button className="btn primary" onClick={() => reset()}>Try again</button>
    </main>
  )
}
