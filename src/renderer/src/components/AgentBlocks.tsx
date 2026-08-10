import { useState, type FC, type ReactNode } from 'react'
import {
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  FileDiff,
  Loader2,
  TriangleAlert
} from 'lucide-react'
import type { AgentBlock, AgentToolContent, AgentToolStatus } from '../../../shared/types'

/**
 * Markdown-lite: fenced code blocks, inline code, bold, headings and bullets.
 * A full parser is a dependency and a security surface; agents mostly emit
 * prose, code fences and lists, and this keeps those readable.
 */
export const Markdown: FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/```/)
  return (
    <div className="space-y-2">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <CodeBlock key={i} raw={part} />
        ) : (
          part.trim() && <Prose key={i} text={part} />
        )
      )}
    </div>
  )
}

const CodeBlock: FC<{ raw: string }> = ({ raw }) => {
  const nl = raw.indexOf('\n')
  const lang = nl === -1 ? '' : raw.slice(0, nl).trim()
  const body = nl === -1 ? raw : raw.slice(nl + 1)
  return (
    <div className="overflow-hidden rounded border border-neutral-800 bg-neutral-900/60">
      {lang && (
        <div className="border-b border-neutral-800 px-2 py-0.5 text-[10px] text-neutral-500">
          {lang}
        </div>
      )}
      <pre className="overflow-x-auto p-2 text-[11px] leading-relaxed text-neutral-300">
        <code>{body.replace(/\n$/, '')}</code>
      </pre>
    </div>
  )
}

const Prose: FC<{ text: string }> = ({ text }) => (
  <div className="space-y-1">
    {text
      .split('\n')
      .map((line, i) => {
        const heading = /^(#{1,6})\s+(.*)$/.exec(line)
        if (heading) {
          return (
            <div key={i} className="pt-1 text-[12px] font-semibold text-neutral-100">
              {inline(heading[2])}
            </div>
          )
        }
        const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
        if (bullet) {
          return (
            <div key={i} className="flex gap-1.5 pl-1 text-[12px] text-neutral-300">
              <span className="text-neutral-600">•</span>
              <span>{inline(bullet[1])}</span>
            </div>
          )
        }
        const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line)
        if (numbered) {
          return (
            <div key={i} className="flex gap-1.5 pl-1 text-[12px] text-neutral-300">
              <span className="text-neutral-600">{numbered[1]}.</span>
              <span>{inline(numbered[2])}</span>
            </div>
          )
        }
        if (!line.trim()) return <div key={i} className="h-1" />
        return (
          <div key={i} className="whitespace-pre-wrap break-words text-[12px] text-neutral-300">
            {inline(line)}
          </div>
        )
      })}
  </div>
)

/** `code`, **bold** and *italic*, in one pass so nesting can't run away. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1] != null) {
      out.push(
        <code key={key++} className="rounded bg-neutral-800 px-1 py-px text-[11px] text-sky-300">
          {m[1]}
        </code>
      )
    } else if (m[2] != null) {
      out.push(
        <strong key={key++} className="font-semibold text-neutral-100">
          {m[2]}
        </strong>
      )
    } else {
      out.push(
        <em key={key++} className="italic">
          {m[3]}
        </em>
      )
    }
    last = re.lastIndex
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export const BlockView: FC<{ block: AgentBlock }> = ({ block }) => {
  if (block.kind === 'text') return <Markdown text={block.text} />
  if (block.kind === 'thought') return <Thought text={block.text} />
  return <ToolCall block={block} />
}

const Thought: FC<{ text: string }> = ({ text }) => {
  const [open, setOpen] = useState(false)
  const firstLine = text.trim().split('\n')[0]
  return (
    <div className="rounded border border-neutral-800/70 bg-neutral-900/30">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-[11px] text-neutral-500 hover:text-neutral-300"
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <Brain size={11} />
        <span className="truncate italic">{open ? 'Thinking' : firstLine}</span>
      </button>
      {open && (
        <div className="border-t border-neutral-800/70 px-2 py-1.5 text-neutral-500">
          <Markdown text={text} />
        </div>
      )}
    </div>
  )
}

const STATUS_ICON: Record<AgentToolStatus, ReactNode> = {
  pending: <CircleDashed size={11} className="text-neutral-600" />,
  in_progress: <Loader2 size={11} className="animate-spin text-sky-400" />,
  completed: <Check size={11} className="text-emerald-500" />,
  failed: <TriangleAlert size={11} className="text-red-400" />
}

const ToolCall: FC<{ block: Extract<AgentBlock, { kind: 'tool' }> }> = ({ block }) => {
  const [open, setOpen] = useState(false)
  const hasBody = block.content.length > 0 || block.locations.length > 0
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900/40">
      <button
        onClick={() => hasBody && setOpen((v) => !v)}
        className={`flex w-full items-center gap-1.5 px-2 py-1 text-left text-[11px] ${
          hasBody ? 'hover:bg-neutral-800/40' : 'cursor-default'
        }`}
      >
        {hasBody ? (
          open ? (
            <ChevronDown size={11} className="text-neutral-600" />
          ) : (
            <ChevronRight size={11} className="text-neutral-600" />
          )
        ) : (
          <span className="w-[11px]" />
        )}
        {STATUS_ICON[block.status]}
        <span className="truncate text-neutral-300">{block.title}</span>
        {block.locations.length > 0 && (
          <span className="ml-auto shrink-0 truncate pl-2 text-[10px] text-neutral-600">
            {block.locations[0].split('/').pop()}
            {block.locations.length > 1 && ` +${block.locations.length - 1}`}
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-1.5 border-t border-neutral-800 p-2">
          {block.content.map((c, i) => (
            <ToolContentView key={i} content={c} />
          ))}
        </div>
      )}
    </div>
  )
}

export const ToolContentView: FC<{ content: AgentToolContent }> = ({ content }) => {
  if (content.kind === 'text') return <Markdown text={content.text} />
  if (content.kind === 'terminal') {
    return (
      <div className="text-[11px] text-neutral-600">
        terminal output ({content.terminalId}) — open the Terminal tab to follow it
      </div>
    )
  }
  return <DiffView path={content.path} oldText={content.oldText} newText={content.newText} />
}

/**
 * Trims the shared head and tail, then shows what's left as removed/added. Not a
 * real LCS diff, but for the single-hunk edits agents make it lands on the same
 * answer without pulling in a diff library.
 */
export const DiffView: FC<{ path: string; oldText: string | null; newText: string }> = ({
  path,
  oldText,
  newText
}) => {
  const before = oldText == null ? [] : oldText.split('\n')
  const after = newText.split('\n')

  let head = 0
  while (head < before.length && head < after.length && before[head] === after[head]) head++
  let tail = 0
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail++
  }
  const removed = before.slice(head, before.length - tail)
  const added = after.slice(head, after.length - tail)

  return (
    <div className="overflow-hidden rounded border border-neutral-800">
      <div className="flex items-center gap-1.5 border-b border-neutral-800 bg-neutral-900/60 px-2 py-0.5 text-[10px] text-neutral-500">
        <FileDiff size={10} />
        <span className="truncate">{path}</span>
        <span className="ml-auto shrink-0 text-neutral-600">
          <span className="text-emerald-500">+{added.length}</span>{' '}
          <span className="text-red-400">−{removed.length}</span>
        </span>
      </div>
      <pre className="max-h-64 overflow-auto bg-neutral-950 p-1.5 text-[11px] leading-snug">
        {head > 0 && <div className="text-neutral-700">@@ line {head + 1} @@</div>}
        {removed.map((line, i) => (
          <div key={`r${i}`} className="whitespace-pre-wrap text-red-400">
            −{line}
          </div>
        ))}
        {added.map((line, i) => (
          <div key={`a${i}`} className="whitespace-pre-wrap text-emerald-400">
            +{line}
          </div>
        ))}
      </pre>
    </div>
  )
}
