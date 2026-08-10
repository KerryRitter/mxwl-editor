import { useEffect, useLayoutEffect, useRef, useState, type FC, type ReactNode } from 'react'
import {
  Bot,
  Check,
  CircleDashed,
  Eraser,
  History,
  KeyRound,
  Loader2,
  Play,
  RefreshCw,
  ShieldQuestion,
  Trash2,
  X
} from 'lucide-react'
import type {
  AgentConnStatus,
  AgentId,
  AgentMessage,
  AgentPermissionRequest,
  AgentPlanEntry,
  AgentSessionState,
  AgentTranscriptMeta
} from '../../../shared/types'
import { useAgentStore, type AgentCatalogEntry, type AgentNote } from '../store/agent'
import { BlockView, ToolContentView } from './AgentBlocks'
import { AgentComposer } from './AgentComposer'

type AgentPanelProps = {
  wsId: string
  /** The panel stays mounted behind the other tabs; only a visible one starts an agent */
  visible: boolean
}

const STATUS_DOT: Record<AgentConnStatus, string> = {
  idle: 'bg-neutral-600',
  starting: 'bg-amber-400',
  'auth-required': 'bg-amber-400',
  ready: 'bg-emerald-500',
  error: 'bg-red-500',
  exited: 'bg-neutral-500'
}

export const AgentPanel: FC<AgentPanelProps> = ({ wsId, visible }) => {
  const session = useAgentStore((s) => s.sessions[wsId] ?? null)
  const catalog = useAgentStore((s) => s.catalog)
  const busy = useAgentStore((s) => s.busy[wsId] ?? false)
  const note = useAgentStore((s) => s.notes[wsId] ?? null)
  const open = useAgentStore((s) => s.open)
  const restart = useAgentStore((s) => s.restart)
  const send = useAgentStore((s) => s.send)
  const cancel = useAgentStore((s) => s.cancel)
  const clear = useAgentStore((s) => s.clear)
  const setMode = useAgentStore((s) => s.setMode)
  const respond = useAgentStore((s) => s.respond)
  const authenticate = useAgentStore((s) => s.authenticate)
  const setNote = useAgentStore((s) => s.setNote)
  const ensureOpen = useAgentStore((s) => s.ensureOpen)
  const history = useAgentStore((s) => s.history[wsId] ?? [])
  const archive = useAgentStore((s) => s.viewing[wsId] ?? null)
  const loadHistory = useAgentStore((s) => s.loadHistory)
  const viewTranscript = useAgentStore((s) => s.viewTranscript)
  const closeTranscript = useAgentStore((s) => s.closeTranscript)
  const deleteTranscript = useAgentStore((s) => s.deleteTranscript)
  const [historyOpen, setHistoryOpen] = useState(false)

  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  const messages = session?.messages ?? []

  useLayoutEffect(() => {
    const el = scroller.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [messages, session?.permission, session?.plan])

  // Showing the tab is the request — waiting on a click to pick the agent that
  // Settings already names is a step with one answer.
  useEffect(() => {
    if (visible) void ensureOpen(wsId)
  }, [visible, wsId, ensureOpen])

  if (!session)
    return <StartScreen wsId={wsId} catalog={catalog} busy={busy} note={note} onOpen={open} />

  const running = session.turn !== 'idle'
  const live = session.status === 'ready'

  return (
    <div className="relative flex h-full flex-col bg-neutral-950">
      <div className="flex items-center gap-2 border-b border-neutral-800 px-2 py-1">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[session.status]}`} />
        <select
          value={session.agentId}
          onChange={(e) => void open(wsId, e.currentTarget.value as AgentId)}
          className="rounded bg-neutral-900 px-1.5 py-0.5 text-[11px] text-neutral-200 outline-none"
        >
          {catalog.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>

        {session.modes.available.length > 0 && (
          <select
            value={session.modes.current ?? ''}
            onChange={(e) => void setMode(wsId, e.currentTarget.value)}
            className="rounded bg-neutral-900 px-1.5 py-0.5 text-[11px] text-neutral-400 outline-none"
          >
            {session.modes.current == null && <option value="">mode…</option>}
            {session.modes.available.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}

        {session.usage && session.usage.size > 0 && (
          <UsageMeter used={session.usage.used} size={session.usage.size} />
        )}

        <div className="ml-auto flex items-center gap-1">
          {session.agentInfo && (
            <span className="truncate pr-1 text-[10px] text-neutral-600">{session.agentInfo}</span>
          )}
          <IconBtn
            title="Saved conversations"
            onClick={() => {
              setHistoryOpen((v) => !v)
              if (!historyOpen) void loadHistory(wsId, session.cwd)
            }}
          >
            <History size={12} />
          </IconBtn>
          <IconBtn title="Clear conversation" onClick={() => void clear(wsId)} disabled={!live}>
            <Eraser size={12} />
          </IconBtn>
          <IconBtn title="Restart agent" onClick={() => void restart(wsId)} disabled={busy}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          </IconBtn>
        </div>
      </div>

      {historyOpen && (
        <HistoryList
          history={history}
          onPick={(id) => {
            void viewTranscript(wsId, id)
            setHistoryOpen(false)
          }}
          onDelete={(id) => void deleteTranscript(wsId, id, session.cwd)}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {archive && (
        <div className="flex items-center gap-2 border-b border-neutral-800 bg-neutral-900 px-2 py-1 text-[11px] text-neutral-400">
          <History size={11} />
          <span className="truncate">
            {archive.agentLabel} · {new Date(archive.startedAt).toLocaleString()}
          </span>
          <button
            onClick={() => closeTranscript(wsId)}
            className="ml-auto shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-200 hover:bg-neutral-700"
          >
            Back to live
          </button>
        </div>
      )}

      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          // Auto-scroll only while the user is already at the bottom, so reading
          // back through a long turn isn't yanked forward by every chunk.
          pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 py-2"
      >
        {archive ? (
          archive.messages.map((m) => <MessageView key={m.id} message={m} />)
        ) : (
          <>
            {messages.length === 0 && session.status === 'ready' && (
              <div className="px-1 pt-2 text-[11px] text-neutral-600">
                {session.agentLabel} is ready in{' '}
                <span className="text-neutral-500">{session.cwd}</span>. Type <kbd>/</kbd> for
                commands, <kbd>@</kbd> for files.
              </div>
            )}
            {messages.map((m) => (
              <MessageView key={m.id} message={m} />
            ))}
            {session.plan.length > 0 && <PlanTracker plan={session.plan} />}
            {session.permission && (
              <PermissionCard
                request={session.permission}
                onAnswer={(optionId) => void respond(wsId, session.permission!.requestId, optionId)}
              />
            )}
            {running && (
              <div className="flex items-center gap-1.5 px-1 text-[11px] text-neutral-500">
                <Loader2 size={11} className="animate-spin" />
                {session.turn === 'cancelling' ? 'stopping…' : 'working…'}
              </div>
            )}
          </>
        )}
      </div>

      {session.status === 'auth-required' && (
        <AuthBar
          methods={session.authMethods}
          busy={busy}
          onPick={(id) => void authenticate(wsId, id)}
        />
      )}

      {(session.error || note) && (
        <div
          className={`flex items-start gap-2 border-t border-neutral-800 px-2 py-1 text-[11px] ${
            note?.tone === 'info'
              ? 'bg-neutral-900 text-neutral-400'
              : 'bg-red-950/30 text-red-300'
          }`}
        >
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
            {note?.text ?? session.error}
          </span>
          {!note && (session.status === 'exited' || session.status === 'error') ? (
            <button
              onClick={() => void restart(wsId)}
              className="shrink-0 rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-200 hover:bg-neutral-700"
            >
              Restart
            </button>
          ) : (
            <button
              onClick={() => setNote(wsId, null)}
              className="shrink-0 text-neutral-500 hover:text-neutral-300"
            >
              dismiss
            </button>
          )}
        </div>
      )}

      <AgentComposer
        wsId={wsId}
        commands={session.commands}
        disabled={!live || archive !== null}
        running={running}
        placeholder={
          archive
            ? 'Viewing a saved conversation — go back to live to reply'
            : live
              ? `Message ${session.agentLabel}…  /commands  @files`
              : `${session.agentLabel} is not running`
        }
        onSend={(text) => {
          void send(wsId, text).then((res) => {
            if (res.kind === 'prompt') setNote(wsId, null)
            else setNote(wsId, { text: res.note, tone: res.kind === 'error' ? 'error' : 'info' })
          })
        }}
        onCancel={() => void cancel(wsId)}
      />
    </div>
  )
}

/**
 * Conversations saved for this folder. They are read-only by design: a new ACP
 * session has no memory of an old one, so replying into an archive would be a
 * conversation only mxwl thinks is happening.
 */
const HistoryList: FC<{
  history: AgentTranscriptMeta[]
  onPick: (id: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}> = ({ history, onPick, onDelete, onClose }) => (
  <div className="absolute right-2 top-8 z-20 max-h-72 w-80 overflow-auto rounded border border-neutral-800 bg-neutral-900 shadow-lg">
    <div className="flex items-center gap-2 border-b border-neutral-800 px-2 py-1 text-[10px] uppercase tracking-wide text-neutral-500">
      Saved conversations
      <button onClick={onClose} className="ml-auto text-neutral-500 hover:text-neutral-300">
        <X size={11} />
      </button>
    </div>
    {history.length === 0 && (
      <div className="px-2 py-2 text-[11px] text-neutral-600">
        Nothing saved for this folder yet.
      </div>
    )}
    {history.map((t) => (
      <div key={t.id} className="group flex items-center gap-2 px-2 py-1 hover:bg-neutral-800">
        <button onClick={() => onPick(t.id)} className="min-w-0 flex-1 text-left">
          <div className="truncate text-[11px] text-neutral-200">{t.title || t.agentLabel}</div>
          <div className="text-[10px] text-neutral-500">
            {t.agentLabel} · {new Date(t.updatedAt).toLocaleString()} · {t.messageCount} msg
          </div>
        </button>
        <button
          title="Delete"
          onClick={() => onDelete(t.id)}
          className="shrink-0 text-neutral-600 opacity-0 hover:text-red-400 group-hover:opacity-100"
        >
          <Trash2 size={11} />
        </button>
      </div>
    ))}
  </div>
)

/** Only reached while the default agent is starting, or after it failed to. */
const StartScreen: FC<{
  wsId: string
  catalog: AgentCatalogEntry[]
  busy: boolean
  note: AgentNote | null
  onOpen: (wsId: string, agentId?: AgentId) => Promise<void>
}> = ({ wsId, catalog, busy, note, onOpen }) => (
  <div className="flex h-full flex-col items-center justify-center gap-3 bg-neutral-950 p-4">
    <div className="flex items-center gap-2 text-[12px] text-neutral-400">
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
      {busy ? 'Starting agent…' : 'Pick an agent for this workspace'}
    </div>
    {note && !busy && (
      <div className="max-w-xl whitespace-pre-wrap break-words rounded bg-red-950/30 px-2 py-1 text-center text-[11px] text-red-300">
        {note.text}
      </div>
    )}
    <div className="flex max-w-xl flex-wrap justify-center gap-1.5">
      {catalog
        .filter((c) => c.id !== 'custom' || c.command)
        .map((c) => (
          <button
            key={c.id}
            disabled={busy}
            onClick={() => void onOpen(wsId, c.id)}
            title={c.hint}
            className="flex items-center gap-1.5 rounded border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-[11px] text-neutral-300 hover:border-neutral-700 hover:text-neutral-100 disabled:opacity-50"
          >
            <Play size={11} /> {c.label}
          </button>
        ))}
    </div>
    <div className="text-[10px] text-neutral-600">
      {busy ? 'starting…' : 'Agents run on the workspace host over ACP.'}
    </div>
  </div>
)

const MessageView: FC<{ message: AgentMessage }> = ({ message }) => {
  if (message.role === 'user') {
    const text = message.blocks.map((b) => (b.kind === 'text' ? b.text : '')).join('')
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded bg-neutral-800 px-2 py-1 text-[12px] text-neutral-200">
          {text}
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      {message.blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </div>
  )
}

const PlanTracker: FC<{ plan: AgentPlanEntry[] }> = ({ plan }) => {
  const done = plan.filter((p) => p.status === 'completed').length
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900/40 p-1.5">
      <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-neutral-600">
        Plan {done}/{plan.length}
      </div>
      {plan.map((entry, i) => (
        <div key={i} className="flex items-start gap-1.5 px-1 py-0.5 text-[11px]">
          {entry.status === 'completed' ? (
            <Check size={11} className="mt-0.5 shrink-0 text-emerald-500" />
          ) : entry.status === 'in_progress' ? (
            <Loader2 size={11} className="mt-0.5 shrink-0 animate-spin text-sky-400" />
          ) : (
            <CircleDashed size={11} className="mt-0.5 shrink-0 text-neutral-600" />
          )}
          <span
            className={
              entry.status === 'completed' ? 'text-neutral-600 line-through' : 'text-neutral-300'
            }
          >
            {entry.content}
          </span>
        </div>
      ))}
    </div>
  )
}

const PermissionCard: FC<{
  request: AgentPermissionRequest
  onAnswer: (optionId: string | null) => void
}> = ({ request, onAnswer }) => (
  <div className="rounded border border-amber-800/60 bg-amber-950/20 p-2">
    <div className="flex items-center gap-1.5 pb-1.5 text-[11px] text-amber-300">
      <ShieldQuestion size={12} />
      <span className="truncate">{request.title}</span>
    </div>
    {request.content.length > 0 && (
      <div className="space-y-1.5 pb-2">
        {request.content.map((c, i) => (
          <ToolContentView key={i} content={c} />
        ))}
      </div>
    )}
    <div className="flex flex-wrap gap-1.5">
      {request.options.map((o) => (
        <button
          key={o.optionId}
          onClick={() => onAnswer(o.optionId)}
          className={`rounded px-2 py-1 text-[11px] ${
            o.kind.startsWith('allow')
              ? 'bg-emerald-900/60 text-emerald-200 hover:bg-emerald-900'
              : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
          }`}
        >
          {o.name}
        </button>
      ))}
      <button
        onClick={() => onAnswer(null)}
        className="rounded px-2 py-1 text-[11px] text-neutral-500 hover:text-neutral-300"
      >
        Cancel
      </button>
    </div>
  </div>
)

const AuthBar: FC<{
  methods: AgentSessionState['authMethods']
  busy: boolean
  onPick: (id: string) => void
}> = ({ methods, busy, onPick }) => (
  <div className="flex flex-wrap items-center gap-1.5 border-t border-neutral-800 bg-amber-950/20 px-2 py-1.5 text-[11px] text-amber-300">
    <KeyRound size={12} />
    <span>Sign in to continue:</span>
    {methods.map((m) => (
      <button
        key={m.id}
        disabled={busy}
        title={m.description ?? undefined}
        onClick={() => onPick(m.id)}
        className="rounded bg-neutral-800 px-2 py-0.5 text-neutral-200 hover:bg-neutral-700 disabled:opacity-50"
      >
        {m.name}
      </button>
    ))}
  </div>
)

const UsageMeter: FC<{ used: number; size: number }> = ({ used, size }) => {
  const pct = Math.min(100, Math.round((used / size) * 100))
  return (
    <div className="flex items-center gap-1" title={`${used} / ${size} context`}>
      <div className="h-1 w-12 overflow-hidden rounded-full bg-neutral-800">
        <div
          className={`h-full ${pct > 85 ? 'bg-red-500' : pct > 60 ? 'bg-amber-400' : 'bg-neutral-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-neutral-600">{pct}%</span>
    </div>
  )
}

const IconBtn: FC<{
  title: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}> = ({ title, onClick, disabled, children }) => (
  <button
    title={title}
    onClick={onClick}
    disabled={disabled}
    className="rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-40"
  >
    {children}
  </button>
)
