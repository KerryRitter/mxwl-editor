/** Tracks terminal progress without depending on a mounted xterm pane. */
export class TerminalActivity {
  busy = false
  private pending = ''
  private timer: ReturnType<typeof setTimeout> | null = null
  private explicit = false

  constructor(private onChange: (busy: boolean) => void) {}

  output(chunk: string): void {
    const data = this.pending + chunk
    // OSC may be split across PTY packets. Keep only the incomplete sequence.
    const start = data.lastIndexOf('\x1b]')
    this.pending = start >= 0 && !/[\x07]|\x1b\\/.test(data.slice(start))
      ? data.slice(start).slice(-1024)
      : ''
    let completed = false
    for (const match of data.matchAll(/\x1b\](133;([ACD])(?:;\d+)?|9;4;([0-4])(?:;\d+)?)(?:\x07|\x1b\\)/g)) {
      const running = match[2] === 'C' || ['1', '2', '3', '4'].includes(match[3])
      this.explicit = running
      completed = !running
      this.clearTimer()
      this.setBusy(running)
    }
    if (this.explicit || completed) return
    const plain = data.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    // Braille/star spinners and the status lines used by Codex and other CLIs.
    if (/[\u2801-\u28ff✢✳✶✻✽]|\b(?:Thinking|Working|Reasoning|Processing)\s*(?:\(|\.{3}|…)/i.test(plain)) {
      this.setBusy(true)
      this.clearTimer()
      this.timer = setTimeout(() => this.setBusy(false), 1800)
      this.timer.unref?.()
    }
  }

  dispose(): void {
    this.pending = ''
    this.explicit = false
    this.clearTimer()
    this.setBusy(false)
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  private setBusy(busy: boolean): void {
    if (busy === this.busy) return
    this.busy = busy
    this.onChange(busy)
  }
}
