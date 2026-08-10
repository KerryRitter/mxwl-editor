import { randomUUID } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import type { AiPlan, AiRunState, AiTargetRun, AiTaskRun } from '../../shared/types'
import { buildHeadlessCommand, buildLaunchCommand } from '../../shared/aiCli'
import { humanDuration } from '../../shared/duration'
import type { SettingsStore } from '../persistence/SettingsStore'
import type { HostShell, WorkspaceManager } from '../workspace/WorkspaceManager'
import { joinRemote, shellQuote } from '../workspace/util'

const POLL_MS = 4000
/** Once setup has exited, the folders are there or they never will be. */
const PREP_FOLDER_GRACE_SEC = 20
/** Lines of setup terminal kept on the run state for the modal */
const PREP_TAIL_LINES = 8
/** A pty emits per keystroke-ish; don't repaint the modal that often. */
const PREP_EMIT_MS = 700
/** How often the log says the setup is still alive */
const PREP_HEARTBEAT_MS = 30_000
// CSI / OSC / two-char escapes — the modal shows text, not a terminal.
const ANSI = /\u001b(?:\[[0-?]*[ -\/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\)|[@-Z\\-_])/g
const TERM_COLS = 160
const TERM_ROWS = 44

export class AiRunner {
  private runs = new Map<string, AiRunState>()
  private cancelled = new Set<string>()

  constructor(
    private workspaces: WorkspaceManager,
    private settings: SettingsStore,
    private getSender: () => BrowserWindow | null
  ) {}

  list(): AiRunState[] {
    return [...this.runs.values()].sort((a, b) => b.startedAt - a.startedAt)
  }

  get(runId: string): AiRunState | undefined {
    return this.runs.get(runId)
  }

  cancel(runId: string): void {
    const run = this.runs.get(runId)
    if (!run || run.status !== 'running') return
    this.cancelled.add(runId)
    run.status = 'cancelled'
    run.finishedAt = Date.now()
    for (const t of run.tasks) if (t.status === 'pending') t.status = 'skipped'
    this.log(run, 'Run cancelled — terminals already launched keep running.')
    this.emit(run)
  }

  /** Kicks the run off and returns immediately; progress arrives on `ai:event`. */
  start(plan: AiPlan): AiRunState {
    const runId = randomUUID()
    const run: AiRunState = {
      runId,
      cli: plan.cli,
      hostId: plan.hostId,
      startedAt: Date.now(),
      status: 'running',
      targets: plan.targets.map<AiTargetRun>((t) => ({
        targetId: t.id,
        key: t.key,
        title: t.title,
        folder: t.folder,
        path: t.folder,
        status: 'pending'
      })),
      tasks: plan.targets.flatMap((t) =>
        t.tasks.map<AiTaskRun>((k) => ({
          targetId: t.id,
          taskId: k.id,
          label: k.label,
          status: 'pending'
        }))
      ),
      log: []
    }
    this.runs.set(runId, run)
    this.emit(run)
    void this.execute(runId, plan)
    return run
  }

  private async execute(runId: string, plan: AiPlan): Promise<void> {
    const run = this.runs.get(runId)!
    let shell: HostShell | null = null
    try {
      shell = await this.workspaces.openHostShell(plan.hostId)
      const root = await shell.resolve(shell.host.workspacesRoot || '~/Workspaces')
      this.log(run, `Host ${shell.host.label} — workspaces root ${root}`)

      if (plan.prep) await this.runPrep(run, plan, plan.prep, shell, root)

      // A blocking setup is the whole reason the tickets wait. If it failed, the
      // checkout it was meant to build is not there — starting the agents anyway
      // is worse than starting them early, so the run stops here.
      if (run.prep?.blocking && run.prep.status === 'error') {
        this.skipRemaining(run, 'setup failed')
        this.log(run, 'run stopped: setup failed, so no ticket agents were started')
        run.status = 'error'
        run.finishedAt = Date.now()
        return
      }

      for (const target of plan.targets) {
        if (this.cancelled.has(runId)) break
        const targetRun = run.targets.find((t) => t.targetId === target.id)!
        targetRun.path = joinRemote(root, target.folder)
        try {
          await this.runTarget(run, plan, target, targetRun, shell, root)
        } catch (err) {
          targetRun.status = 'error'
          targetRun.message = errText(err)
          for (const task of run.tasks.filter(
            (t) => t.targetId === target.id && t.status === 'pending'
          )) {
            task.status = 'skipped'
            task.message = 'target failed'
          }
          this.log(run, `${targetRun.key ?? targetRun.title}: ${targetRun.message}`)
          this.emit(run)
        }
      }

      if (!this.cancelled.has(runId)) {
        run.status = run.targets.some((t) => t.status === 'error') ? 'error' : 'done'
        run.finishedAt = Date.now()
      }
    } catch (err) {
      run.status = 'error'
      run.finishedAt = Date.now()
      this.log(run, errText(err))
    } finally {
      await shell?.close()
      this.cancelled.delete(runId)
      this.emit(run)
    }
  }

  /** Marks everything still queued as skipped, so the modal shows why nothing ran. */
  private skipRemaining(run: AiRunState, why: string): void {
    for (const target of run.targets) {
      if (target.status !== 'pending') continue
      target.status = 'skipped'
      target.message = why
    }
    for (const task of run.tasks) {
      if (task.status !== 'pending') continue
      task.status = 'skipped'
      task.message = why
    }
  }

  private async runTarget(
    run: AiRunState,
    plan: AiPlan,
    target: AiPlan['targets'][number],
    targetRun: AiTargetRun,
    shell: HostShell,
    root: string
  ): Promise<void> {
    const label = targetRun.key ?? targetRun.title
    const path = targetRun.path

    if (!(await dirExists(shell, path))) {
      targetRun.status = 'provisioning'
      this.log(run, `${label}: ${path} missing — running branch init`)
      this.emit(run)
      await this.provision(run, plan, targetRun, shell, root)
    }

    targetRun.status = 'opening'
    this.emit(run)
    const wsId = await this.ensureWorkspace(plan.hostId, path)
    targetRun.wsId = wsId
    this.log(run, `${label}: workspace ready`)

    for (const task of target.tasks) {
      if (this.cancelled.has(run.runId)) return
      const taskRun = run.tasks.find((t) => t.taskId === task.id)!
      taskRun.wsId = wsId
      taskRun.status = 'launching'
      this.emit(run)
      try {
        const promptFile = await this.writePromptFile(shell, run.runId, task.id, task.prompt)
        const sessionId = await this.workspaces.openTerminal(wsId, {
          cwd: path,
          cols: TERM_COLS,
          rows: TERM_ROWS,
          label: task.label,
          aiTaskId: task.id
        })
        taskRun.sessionId = sessionId
        this.workspaces.writeTerminal(
          wsId,
          sessionId,
          `${buildLaunchCommand(plan.cli, this.settings.all().ai, shellQuote(promptFile))}\r`
        )
        taskRun.status = 'running'
        this.log(run, `${label}: launched ${plan.cli} for ${task.label}`)
      } catch (err) {
        taskRun.status = 'error'
        taskRun.message = errText(err)
        this.log(run, `${label}/${task.label}: ${taskRun.message}`)
      }
      this.emit(run)
    }

    // Nothing was launched when the brief only asked for the tabs — the workspace
    // being open is the finished state, not a running one.
    targetRun.status = target.tasks.length > 0 ? 'running' : 'done'
    this.emit(run)
  }

  /**
   * The brief's own setup command: run once, in the folder the brief named, in a
   * visible terminal. A `/slash-command` goes through the AI CLI; anything else is
   * typed straight into the shell. When the brief said "then", the run blocks here
   * until every ticket folder exists.
   */
  private async runPrep(
    run: AiRunState,
    plan: AiPlan,
    prep: NonNullable<AiPlan['prep']>,
    shell: HostShell,
    root: string
  ): Promise<void> {
    const path = prep.cwd.startsWith('/') || prep.cwd.startsWith('~')
      ? await shell.resolve(prep.cwd)
      : joinRemote(root, prep.cwd)

    run.prep = { command: prep.command, path, status: 'provisioning', blocking: prep.blocking }
    this.emit(run)

    let stopWatch: (() => void) | null = null
    try {
      if (!(await dirExists(shell, path))) {
        throw new Error(`${path} does not exist on ${shell.host.label}`)
      }

      const wsId = await this.ensureWorkspace(plan.hostId, path)
      run.prep.wsId = wsId
      const sessionId = await this.workspaces.openTerminal(wsId, {
        cwd: path,
        cols: TERM_COLS,
        rows: TERM_ROWS,
        label: 'setup'
      })
      run.prep.sessionId = sessionId

      const ai = this.settings.all().ai
      let line: string
      if (prep.kind === 'cli') {
        const file = await this.writePromptFile(shell, run.runId, 'prep', prep.prompt)
        // An interactive CLI sits at its REPL once the turn ends, so it would never
        // hand the shell back. A blocking setup runs headless instead: same output
        // in the same terminal, but the process exits when the work is done.
        line = prep.blocking
          ? buildHeadlessCommand(plan.cli, ai, shellQuote(file))
          : buildLaunchCommand(plan.cli, ai, shellQuote(file))
      } else {
        line = prep.command
      }

      // The exit marker is the only honest "setup finished" signal. Folder presence
      // is not: a command like /agent/init-branch creates the folder in its first
      // step and then spends minutes checking out, building and booting it, so
      // waiting on the folder releases the ticket agents onto a half-built tree.
      const doneFile = prep.blocking
        ? await this.cachePath(shell, run.runId, 'prep.exit')
        : null
      if (doneFile) line = `${line}; echo $? > ${shellQuote(doneFile)}`

      stopWatch = this.tailPrep(run, wsId, sessionId)
      this.workspaces.writeTerminal(wsId, sessionId, `${line}\r`)
      this.log(run, `setup: ran ${prep.command} in ${path}`)

      run.prep.startedAt = Date.now()
      run.prep.status = 'running'
      this.emit(run)
      if (!doneFile) return

      const exit = await this.waitForPrepExit(run, shell, doneFile)
      if (exit !== 0) {
        throw new Error(`setup command exited ${exit} — see the setup terminal`)
      }
      // It exited cleanly, so a missing folder now is a real mismatch between the
      // command and the folder template, not something more waiting would fix.
      await this.waitForTargets(run, shell, PREP_FOLDER_GRACE_SEC)
      run.prep.status = 'done'
      const took = run.prep.startedAt ? ` in ${humanDuration(Date.now() - run.prep.startedAt)}` : ''
      this.log(run, `setup: finished${took}, all ticket folders present`)
    } catch (err) {
      run.prep.status = 'error'
      run.prep.message = errText(err)
      this.log(run, `setup: ${run.prep.message}`)
    } finally {
      stopWatch?.()
      if (run.prep.status !== 'running') run.prep.finishedAt = Date.now()
    }
    this.emit(run)
  }

  /**
   * Mirrors the tail of the setup terminal onto the run state. A cold
   * `/agent/init-branch` runs for minutes, and the modal is the only thing the
   * operator is looking at — a blank card gives no way to tell work from a hang.
   */
  private tailPrep(run: AiRunState, wsId: string, sessionId: string): () => void {
    let buffer = ''
    let last = 0
    let timer: NodeJS.Timeout | null = null

    const flush = (): void => {
      timer = null
      last = Date.now()
      if (!run.prep) return
      const lines = buffer
        .replace(/\r\n?/g, '\n')
        .replace(ANSI, '')
        .split('\n')
        .map((l) => l.trimEnd())
        .filter(Boolean)
      const tail = lines.slice(-PREP_TAIL_LINES)
      if (tail.join('\n') === (run.prep.output ?? []).join('\n')) return
      run.prep.output = tail
      this.emit(run)
    }

    const stop = this.workspaces.watchTerminal(wsId, sessionId, (chunk) => {
      buffer += chunk
      // Only the tail is ever shown, so the buffer never needs to grow unbounded.
      if (buffer.length > 16_000) buffer = buffer.slice(-8000)
      if (timer) return
      const wait = Math.max(0, PREP_EMIT_MS - (Date.now() - last))
      timer = setTimeout(flush, wait)
    })

    return () => {
      if (timer) clearTimeout(timer)
      stop()
      flush()
    }
  }

  /**
   * Polls for the marker the setup line appends when it returns — the point at
   * which the setup command has genuinely finished. Resolves to its exit code.
   */
  private async waitForPrepExit(
    run: AiRunState,
    shell: HostShell,
    doneFile: string
  ): Promise<number> {
    const timeoutSec = this.settings.all().ai.initTimeoutSec
    const startedAt = Date.now()
    const deadline = startedAt + timeoutSec * 1000
    let beat = startedAt
    for (;;) {
      if (this.cancelled.has(run.runId)) throw new Error('cancelled during setup')
      if (Date.now() - beat >= PREP_HEARTBEAT_MS) {
        beat = Date.now()
        this.log(run, `setup: still running (${humanDuration(beat - startedAt)})`)
        this.emit(run)
      }
      const { code, stdout } = await shell.exec(`cat ${shellQuote(doneFile)} 2>/dev/null`)
      if (code === 0 && stdout.trim()) {
        const exit = Number(stdout.trim())
        return Number.isFinite(exit) ? exit : 0
      }
      if (Date.now() > deadline) {
        throw new Error(
          `setup command still running after ${timeoutSec}s — see the setup terminal, or raise the init timeout`
        )
      }
      await new Promise((r) => setTimeout(r, POLL_MS))
    }
  }

  /** Absolute path inside this run's host cache dir, with the dir created. */
  private async cachePath(shell: HostShell, runId: string, name: string): Promise<string> {
    const dir = `$HOME/.cache/mxwl/ai/${runId}`
    const { code, stderr } = await shell.exec(`mkdir -p ${dir}`)
    if (code !== 0) throw new Error(`could not create ${dir}: ${stderr.trim() || `exit ${code}`}`)
    const { stdout } = await shell.exec(`printf %s ${dir}/${name}`)
    return stdout.trim() || `${dir}/${name}`
  }

  /** Polls until every target folder exists, so the ticket agents open on real checkouts. */
  private async waitForTargets(run: AiRunState, shell: HostShell, timeoutSec?: number): Promise<void> {
    const timeout = timeoutSec ?? this.settings.all().ai.initTimeoutSec
    const deadline = Date.now() + timeout * 1000
    const pending = new Set(run.targets.map((t) => t.targetId))
    for (;;) {
      if (this.cancelled.has(run.runId)) throw new Error('cancelled during setup')
      for (const targetId of [...pending]) {
        const target = run.targets.find((t) => t.targetId === targetId)!
        if (await dirExists(shell, target.path)) {
          pending.delete(targetId)
          this.log(run, `setup: ${target.key ?? target.folder} ready`)
          this.emit(run)
        }
      }
      if (pending.size === 0) return
      if (Date.now() > deadline) {
        throw new Error(
          `timed out after ${timeout}s waiting for ${pending.size} folder(s) — see the setup terminal`
        )
      }
      await new Promise((r) => setTimeout(r, POLL_MS))
    }
  }

  /**
   * Runs the configured init command in the base repo and waits for the task
   * folder to appear. The command runs in a real terminal so its output — and
   * any prompt it asks — is visible to the user.
   */
  private async provision(
    run: AiRunState,
    plan: AiPlan,
    targetRun: AiTargetRun,
    shell: HostShell,
    root: string
  ): Promise<void> {
    const ai = this.settings.all().ai
    // The brief's own setup command already had its chance; don't silently run a
    // second, different init command behind the user's back.
    if (run.prep) {
      throw new Error(
        `${targetRun.folder} still missing after setup${run.prep.message ? ` (${run.prep.message})` : ''} — see the setup terminal`
      )
    }
    const missing = [
      !ai.baseRepoFolder && 'Base repo folder',
      !ai.initBranchCommand && 'Branch init command'
    ].filter(Boolean)
    if (missing.length > 0) {
      throw new Error(
        `${targetRun.folder} does not exist — either name the setup command in the brief ("in ~/repo, run …, then …") or set Settings → AI → ${missing.join(' and ')}`
      )
    }
    const basePath = joinRemote(root, ai.baseRepoFolder)
    if (!(await dirExists(shell, basePath))) {
      throw new Error(`base repo ${basePath} not found`)
    }

    const baseWsId = await this.ensureWorkspace(plan.hostId, basePath)
    const command = renderInit(ai.initBranchCommand, targetRun)
    const sessionId = await this.workspaces.openTerminal(baseWsId, {
      cwd: basePath,
      cols: TERM_COLS,
      rows: TERM_ROWS,
      label: `init ${targetRun.key ?? targetRun.folder}`
    })
    this.workspaces.writeTerminal(baseWsId, sessionId, `${command}\r`)

    const deadline = Date.now() + ai.initTimeoutSec * 1000
    for (;;) {
      if (this.cancelled.has(run.runId)) throw new Error('cancelled during branch init')
      await new Promise((r) => setTimeout(r, POLL_MS))
      if (await dirExists(shell, targetRun.path)) {
        this.log(run, `${targetRun.key ?? targetRun.folder}: branch folder created`)
        return
      }
      if (Date.now() > deadline) {
        throw new Error(
          `branch init did not create ${targetRun.path} within ${ai.initTimeoutSec}s — see the init terminal`
        )
      }
    }
  }

  private async ensureWorkspace(hostId: string, path: string): Promise<string> {
    const existing = this.workspaces.findByPath(hostId, path)
    const id = existing
      ? existing.id
      : (await this.workspaces.open(hostId, path, { focus: false })).id
    await this.workspaces.waitForConnected(id)
    return id
  }

  /**
   * Prompts go to a file on the host and are read back with `"$(cat …)"`, which
   * keeps long prompts off the PTY line buffer and stops the shell re-expanding
   * `$agent-…` tokens in the prompt body.
   */
  private async writePromptFile(
    shell: HostShell,
    runId: string,
    taskId: string,
    prompt: string
  ): Promise<string> {
    const dir = `$HOME/.cache/mxwl/ai/${runId}`
    const file = `${dir}/${taskId.replace(/[^\w.-]/g, '_')}.md`
    const delimiter = `MXWL_PROMPT_${runId.replace(/-/g, '').slice(0, 8).toUpperCase()}`
    const body = prompt.replace(/\r\n/g, '\n')
    if (body.split('\n').some((l) => l.trim() === delimiter)) {
      throw new Error('prompt collided with heredoc delimiter')
    }
    const { code, stderr } = await shell.exec(
      `mkdir -p ${dir} && cat > ${file} <<'${delimiter}'\n${body}\n${delimiter}\n`
    )
    if (code !== 0) throw new Error(`could not stage prompt file: ${stderr.trim() || `exit ${code}`}`)
    const { stdout } = await shell.exec(`printf %s ${file}`)
    return stdout.trim() || file
  }

  private log(run: AiRunState, text: string): void {
    run.log.push({ ts: Date.now(), text })
    if (run.log.length > 200) run.log.splice(0, run.log.length - 200)
  }

  private emit(run: AiRunState): void {
    this.getSender()?.webContents.send('ai:event', run)
  }
}

async function dirExists(shell: HostShell, path: string): Promise<boolean> {
  const { stdout } = await shell.exec(`test -d ${shellQuote(path)} && echo yes || echo no`)
  return stdout.trim().endsWith('yes')
}

/** Init command template vars: ${key} ${folder} ${title} ${keyNum} */
function renderInit(template: string, target: AiTargetRun): string {
  const key = target.key ?? ''
  const vars: Record<string, string> = {
    key,
    keyLower: key.toLowerCase(),
    keyNum: /\d+/.exec(key)?.[0] ?? '',
    folder: target.folder,
    title: target.title
  }
  if (/\$\{/.test(template)) {
    return template.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (_m, name: string) => vars[name] ?? '')
  }
  // No placeholders — pass the ticket as an argument, e.g. `$agent-init-branch PLAT-1`
  return key ? `${template.trim()} ${key}` : template.trim()
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
