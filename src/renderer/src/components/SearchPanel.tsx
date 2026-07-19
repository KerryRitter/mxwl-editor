import { useEffect, useState, type FC } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import type { SearchHit } from '../../../shared/types'
import { useEditorStore } from '../store/editor'
import { basename } from '../util'

export const SearchPanel: FC<{ wsId: string; onClose: () => void }> = ({ wsId, onClose }) => {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = useEditorStore((s) => s.open)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  useEffect(() => {
    if (!query.trim()) {
      setHits([])
      return
    }
    const t = setTimeout(() => {
      setLoading(true)
      setError(null)
      window.api.workspace
        .search(wsId, query.trim())
        .then(setHits)
        .catch((e) => setError(String(e)))
        .finally(() => setLoading(false))
    }, 280)
    return () => clearTimeout(t)
  }, [query, wsId])

  return (
    <div className="flex h-full flex-col bg-neutral-950">
      <div className="flex items-center gap-1 border-b border-neutral-800 px-2 py-1">
        <Search size={12} className="text-neutral-500" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search files (rg)…"
          className="min-w-0 flex-1 bg-transparent text-[12px] text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
        />
        <button onClick={onClose} className="rounded p-0.5 text-neutral-500 hover:text-neutral-200">
          <X size={12} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto text-[12px]">
        {loading && (
          <div className="flex items-center gap-2 px-3 py-3 text-neutral-500">
            <Loader2 size={12} className="animate-spin" /> Searching…
          </div>
        )}
        {error && <div className="px-3 py-2 text-red-400">{error}</div>}
        {!loading && !error && query && hits.length === 0 && (
          <div className="px-3 py-3 text-neutral-600">No matches</div>
        )}
        {hits.map((h, i) => (
          <button
            key={`${h.path}:${h.line}:${i}`}
            onClick={() => open(h.path)}
            className="flex w-full flex-col gap-0.5 border-b border-neutral-900 px-2 py-1.5 text-left hover:bg-neutral-900"
          >
            <span className="truncate text-[11px] text-emerald-400/90">
              {basename(h.path)}
              <span className="text-neutral-600">:{h.line}</span>
            </span>
            <span className="truncate font-mono text-[11px] text-neutral-400">{h.text}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
