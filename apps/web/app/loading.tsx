export default function Loading() {
  return (
    <main className="route-fallback" aria-live="polite" aria-busy="true">
      <div className="mark">E</div>
      <p>Preparing ECHOLOG workspace…</p>
      <span className="route-progress" />
    </main>
  )
}
