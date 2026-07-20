import { useCallback, useEffect, useState, type FC } from 'react'
import {
  ChevronRight,
  File as FileIcon,
  Folder,
  FolderOpen,
  RefreshCw
} from 'lucide-react'
import type { DirEntry } from '../../../shared/types'
import { useEditorStore } from '../store/editor'
import { basename } from '../util'

type DirNodeProps = {
  wsId: string
  path: string
  name: string
  depth: number
  refreshNonce: number
}

export const FileTree: FC<{ wsId: string; root: string }> = ({ wsId, root }) => {
  const [refreshNonce, setRefreshNonce] = useState(0)
  return (
    <div className="flex h-full flex-col bg-neutral-950">
      <div className="flex items-center justify-between border-b border-neutral-800 px-2 py-1">
        <span className="text-[11px] uppercase tracking-wider text-neutral-500">Files</span>
        <button
          onClick={() => setRefreshNonce((n) => n + 1)}
          title="Refresh"
          className="rounded p-0.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
        >
          <RefreshCw size={12} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1 text-[13px]">
        <DirNode
          key={`${root}-${refreshNonce}`}
          wsId={wsId}
          path={root}
          name={basename(root)}
          depth={0}
          refreshNonce={refreshNonce}
        />
      </div>
    </div>
  )
}

const DirNode: FC<DirNodeProps> = ({ wsId, path, name, depth, refreshNonce }) => {
  const [expanded, setExpanded] = useState(depth === 0)
  const [children, setChildren] = useState<DirEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const open = useEditorStore((s) => s.open)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setChildren(await window.api.fs.readDir(wsId, path))
    } catch {
      setChildren([])
    } finally {
      setLoading(false)
    }
  }, [wsId, path])

  useEffect(() => {
    if (expanded) void load()
  }, [expanded, load, refreshNonce])

  // poll while expanded so remote edits show up
  useEffect(() => {
    if (!expanded) return
    const t = setInterval(() => void load(), 12000)
    return () => clearInterval(t)
  }, [expanded, load])

  const indent = { paddingLeft: depth * 12 + 8 }

  return (
    <div>
      <button
        onClick={() => setExpanded((e) => !e)}
        style={indent}
        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-neutral-300 hover:bg-neutral-800"
      >
        {expanded ? (
          <ChevronRight size={12} className="rotate-90 text-neutral-500" />
        ) : (
          <ChevronRight size={12} className="text-neutral-500" />
        )}
        {expanded ? (
          <FolderOpen size={13} className="text-amber-400" />
        ) : (
          <Folder size={13} className="text-amber-500/80" />
        )}
        <span className="truncate">{name}</span>
      </button>

      {expanded && loading && children === null && (
        <div style={{ paddingLeft: (depth + 1) * 12 + 28 }} className="py-0.5 text-[11px] text-neutral-600">
          …
        </div>
      )}
      {expanded &&
        children?.map((c) =>
          c.isDirectory ? (
            <DirNode
              key={c.path}
              wsId={wsId}
              path={c.path}
              name={c.name}
              depth={depth + 1}
              refreshNonce={refreshNonce}
            />
          ) : (
            <FileRow
              key={c.path}
              depth={depth + 1}
              name={c.name}
              onClick={() => open(wsId, c.path)}
            />
          )
        )}
    </div>
  )
}

const FileRow: FC<{
  depth: number
  name: string
  onClick: () => void
}> = ({ depth, name, onClick }) => {
  return (
    <button
      onClick={onClick}
      style={{ paddingLeft: depth * 12 + 28 }}
      className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
    >
      <FileIcon size={12} className="text-neutral-500" />
      <span className="truncate">{name}</span>
    </button>
  )
}
