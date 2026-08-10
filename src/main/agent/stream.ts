import * as acp from '@agentclientprotocol/sdk'
import type { ChannelLike } from '../workspace/LocalConnection'

/**
 * Bridges the duplex channel both connection kinds already expose — a local
 * child process, or an ssh2 exec channel — onto the WHATWG streams the ACP SDK
 * wants. stderr is deliberately not part of the protocol stream: agents log
 * diagnostics there, and folding it into stdin would corrupt the JSON-RPC frame.
 */
export function channelStream(
  channel: ChannelLike,
  onStderr?: (text: string) => void,
  onClose?: (code: number | null) => void
): acp.Stream {
  let pushChunk: ((chunk: Uint8Array) => void) | null = null
  let closeReader: (() => void) | null = null
  const pending: Uint8Array[] = []
  let closed = false

  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      pushChunk = (chunk) => controller.enqueue(chunk)
      closeReader = () => {
        try {
          controller.close()
        } catch {
          // already closed by an earlier error path
        }
      }
      for (const chunk of pending) controller.enqueue(chunk)
      pending.length = 0
      if (closed) closeReader()
    }
  })

  channel.on('data', (d: unknown) => {
    const buf = toBytes(d)
    if (pushChunk) pushChunk(buf)
    else pending.push(buf)
  })

  channel.stderr.on('data', (d: unknown) => {
    onStderr?.(Buffer.from(toBytes(d)).toString())
  })

  channel.on('close', (code: unknown) => {
    closed = true
    closeReader?.()
    onClose?.(typeof code === 'number' ? code : null)
  })

  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      channel.write(Buffer.from(chunk))
    },
    close() {
      try {
        channel.end()
      } catch {
        // the process may already be gone
      }
    }
  })

  return acp.ndJsonStream(writable, readable)
}

function toBytes(d: unknown): Uint8Array {
  if (Buffer.isBuffer(d)) return new Uint8Array(d)
  if (d instanceof Uint8Array) return d
  return new Uint8Array(Buffer.from(String(d)))
}
