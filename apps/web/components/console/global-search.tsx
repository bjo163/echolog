'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Command, Search } from 'lucide-react'
import { SECTIONS, searchSections } from '../../lib/nav'
import { useConsole } from './provider'

/**
 * Global search and the command palette.
 *
 * Both are scoped to what the console can actually answer. The search field
 * says it searches objects, because that is the only index the API exposes;
 * the palette adds navigation. Neither one pretends to search every field of
 * every record.
 */

export function GlobalSearch() {
  const router = useRouter()
  const { aliases } = useConsole()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement | null>(null)

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return []
    return aliases
      .filter((alias) => alias.key.toLowerCase().includes(needle) || alias.digest.toLowerCase().includes(needle))
      .slice(0, 8)
  }, [aliases, query])

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [])

  return (
    <div className='global-search' ref={box}>
      <div className='search'>
        <Search size={15} aria-hidden='true' />
        <input
          aria-label='Search stored objects by key or digest'
          value={query}
          placeholder='Search objects…'
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false)
          }}
        />
      </div>
      {open && query.trim() ? (
        <div className='search-results' role='listbox' aria-label='Object search results'>
          {matches.length === 0 ? (
            <p className='fine'>No stored object matches that key or digest.</p>
          ) : (
            matches.map((alias) => (
              <button
                key={alias.digest}
                type='button'
                role='option'
                aria-selected={false}
                className='search-result'
                onClick={() => {
                  setOpen(false)
                  setQuery('')
                  router.push('/objects/' + encodeURIComponent(alias.digest))
                }}
              >
                <span>{alias.key}</span>
                <code className='digest'>{alias.digest.slice(0, 12)}…</code>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

export function CommandPalette() {
  const router = useRouter()
  const { aliases } = useConsole()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((value) => !value)
      }
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const sections = useMemo(() => searchSections(query), [query])
  const objects = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return []
    return aliases.filter((alias) => alias.key.toLowerCase().includes(needle)).slice(0, 6)
  }, [aliases, query])

  if (!open) return null

  const go = (href: string) => {
    setOpen(false)
    setQuery('')
    router.push(href)
  }

  return (
    <div className='drawer-layer'>
      <div className='scrim' onClick={() => setOpen(false)} aria-hidden='true' />
      <div className='palette' role='dialog' aria-modal='true' aria-label='Command palette'>
        <div className='search'>
          <Command size={15} aria-hidden='true' />
          <input
            autoFocus
            aria-label='Search sections and objects'
            value={query}
            placeholder='Go to a section, or find an object…'
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className='palette-body'>
          {sections.length > 0 ? (
            <>
              <span className='eyebrow'>Sections</span>
              {sections.map((section) => (
                <button key={section.id} type='button' className='palette-item' onClick={() => go(section.href)}>
                  <b>{section.label}</b>
                  <span className='fine'>{section.description}</span>
                </button>
              ))}
            </>
          ) : null}
          {objects.length > 0 ? (
            <>
              <span className='eyebrow'>Objects</span>
              {objects.map((alias) => (
                <button
                  key={alias.digest}
                  type='button'
                  className='palette-item'
                  onClick={() => go('/objects/' + encodeURIComponent(alias.digest))}
                >
                  <b>{alias.key}</b>
                  <span className='fine'>{alias.content_type}</span>
                </button>
              ))}
            </>
          ) : null}
          {sections.length === 0 && objects.length === 0 ? (
            <p className='fine'>Nothing matches that query.</p>
          ) : null}
        </div>
        <footer className='fine'>Press Escape to close. Press Control or Command plus K to reopen.</footer>
      </div>
    </div>
  )
}
