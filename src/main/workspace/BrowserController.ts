import { randomUUID } from 'node:crypto'
import { BrowserWindow, Rectangle, WebContentsView, session } from 'electron'
import type { BrowserTab, TabGroup } from '../../shared/types'
import {
  DEFAULT_GROUP_ID,
  groupColor,
  groupPartition,
  makeDefaultGroup
} from '../../shared/tabGroups'

interface InternalTab extends BrowserTab {
  view: WebContentsView
  devtoolsOpen: boolean
}

export interface BrowserSnapshot {
  wsId: string
  activeId: string | null
  tabs: BrowserTab[]
  groups: TabGroup[]
}

const HIDDEN: Rectangle = { x: 0, y: 0, width: 0, height: 0 }

export class BrowserController {
  readonly wsId: string
  private tabs = new Map<string, InternalTab>()
  private groups: TabGroup[]
  private nextGroupN = 2
  private activeId: string | null = null
  private visible = false
  private bounds: Rectangle | null = null
  private getSender: () => BrowserWindow | null

  /** Embedded Chromium DevTools (Elements / Network / …) over the bottom panel. */
  private dtView: WebContentsView | null = null
  private dtVisible = false
  private dtBounds: Rectangle | null = null
  private dtAttachedTabId: string | null = null

  constructor(wsId: string, getSender: () => BrowserWindow | null) {
    this.wsId = wsId
    this.getSender = getSender
    this.groups = [makeDefaultGroup(wsId)]
  }

  /** New cookie sandbox. Tabs in it share nothing with the other groups. */
  newGroup(label?: string): string {
    const n = this.nextGroupN++
    const id = `g${n}`
    this.groups.push({
      id,
      label: label?.trim() || `Group ${n}`,
      color: groupColor(n - 1),
      partition: groupPartition(this.wsId, id)
    })
    this.emit()
    return id
  }

  updateGroup(id: string, patch: { label?: string; color?: string }): void {
    const group = this.groups.find((g) => g.id === id)
    if (!group) return
    if (patch.label?.trim()) group.label = patch.label.trim()
    if (patch.color) group.color = patch.color
    this.emit()
  }

  /** Closes the group and every tab in it. The default group cannot be removed. */
  closeGroup(id: string): void {
    if (id === DEFAULT_GROUP_ID || !this.groups.some((g) => g.id === id)) return
    for (const tab of [...this.tabs.values()]) {
      if (tab.groupId === id) this.closeTab(tab.id)
    }
    this.groups = this.groups.filter((g) => g.id !== id)
    this.emit()
  }

  /** Wipes the group's cookies and storage without touching the other groups. */
  async clearGroup(id: string): Promise<void> {
    const group = this.groups.find((g) => g.id === id)
    if (!group) return
    const sess = group.partition ? session.fromPartition(group.partition) : session.defaultSession
    await sess.clearStorageData()
  }

  /**
   * A view's partition is fixed at construction, so moving a tab means rebuilding
   * it in the target sandbox. The URL carries over; page state does not.
   */
  moveTab(tabId: string, groupId: string): string | null {
    const tab = this.tabs.get(tabId)
    if (!tab || tab.groupId === groupId) return null
    if (!this.groups.some((g) => g.id === groupId)) return null
    const url = tab.url
    this.closeTab(tabId)
    return this.newTab(url || 'about:blank', groupId)
  }

  newTab(url?: string, groupId?: string): string {
    const id = randomUUID()
    const group = this.groups.find((g) => g.id === groupId) ?? this.groups[0]
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
        ...(group.partition ? { partition: group.partition } : {})
      }
    })
    view.setBackgroundColor('#1a1a1a')
    view.setBounds(HIDDEN)

    const win = this.getSender()
    win?.contentView.addChildView(view)

    const tab: InternalTab = {
      id,
      view,
      url: url ?? '',
      title: url ? 'Loading…' : 'New Tab',
      loading: Boolean(url),
      canGoBack: false,
      canGoForward: false,
      zoom: 1,
      groupId: group.id,
      devtoolsOpen: false
    }
    this.tabs.set(id, tab)

    const wc = view.webContents
    wc.on('did-start-loading', () => {
      tab.loading = true
      this.emit()
    })
    wc.on('did-stop-loading', () => {
      tab.loading = false
      this.emit()
    })
    wc.on('did-navigate', (_e, u: string) => {
      tab.url = u
      tab.canGoBack = wc.navigationHistory.canGoBack()
      tab.canGoForward = wc.navigationHistory.canGoForward()
      this.emit()
    })
    wc.on('did-navigate-in-page', (_e, u: string) => {
      tab.url = u
      tab.canGoBack = wc.navigationHistory.canGoBack()
      tab.canGoForward = wc.navigationHistory.canGoForward()
      this.emit()
    })
    wc.on('page-title-updated', (_e, title: string) => {
      tab.title = title
      this.emit()
    })
    wc.on('page-favicon-updated', (_e, favicons: string[]) => {
      tab.favicon = favicons[0]
      this.emit()
    })
    wc.on('devtools-opened', () => {
      tab.devtoolsOpen = true
    })
    wc.on('devtools-closed', () => {
      tab.devtoolsOpen = false
    })
    wc.on('console-message', (_e, level, message, line, sourceId) => {
      this.getSender()?.webContents.send('browser:console', {
        wsId: this.wsId,
        tabId: id,
        level,
        message: String(message),
        line: Number(line) || 0,
        sourceId: String(sourceId || '')
      })
    })

    if (url) {
      try {
        wc.loadURL(url)
      } catch (err) {
        void err
      }
    }

    this.activeId = id
    this.apply()
    if (this.dtVisible) this.attachDevtoolsToActive()
    this.emit()
    return id
  }

  closeTab(id: string): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    if (this.dtAttachedTabId === id) this.destroyDevtoolsHost()
    this.getSender()?.contentView.removeChildView(tab.view)
    try {
      if (tab.devtoolsOpen) tab.view.webContents.closeDevTools()
      ;(tab.view as unknown as { webContents: { destroy: () => void } }).webContents.destroy()
    } catch (err) {
      void err
    }
    this.tabs.delete(id)
    if (this.activeId === id) {
      const remaining = [...this.tabs.keys()]
      this.activeId = remaining[remaining.length - 1] ?? null
    }
    this.apply()
    if (this.dtVisible) this.attachDevtoolsToActive()
    this.emit()
  }

  setActive(id: string): void {
    if (!this.tabs.has(id)) return
    this.activeId = id
    this.apply()
    if (this.dtVisible) this.attachDevtoolsToActive()
    this.emit()
  }

  navigate(id: string, url: string): void {
    const wc = this.tabs.get(id)?.view.webContents
    if (!wc) return
    const normalized = normalizeUrl(url)
    try {
      wc.loadURL(normalized)
    } catch (err) {
      void err
    }
  }

  back(id: string): void {
    this.tabs.get(id)?.view.webContents.goBack()
  }
  forward(id: string): void {
    this.tabs.get(id)?.view.webContents.goForward()
  }
  reload(id: string): void {
    this.tabs.get(id)?.view.webContents.reloadIgnoringCache()
  }

  async fillLogin(opts: {
    username: string
    password: string
    usernameSelector: string
    passwordSelector: string
    submitSelector: string
  }): Promise<void> {
    const tabId = this.activeId
    if (!tabId) throw new Error('no active browser tab')
    const wc = this.tabs.get(tabId)?.view.webContents
    if (!wc) throw new Error('no active browser tab')

    const script = `(() => {
      const setNative = (el, value) => {
        if (!el) throw new Error('element not found');
        const proto = el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(el, value);
        else el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const user = document.querySelector(${JSON.stringify(opts.usernameSelector)});
      const pass = document.querySelector(${JSON.stringify(opts.passwordSelector)});
      const submit = document.querySelector(${JSON.stringify(opts.submitSelector)});
      if (!user) throw new Error('username selector matched nothing');
      if (!pass) throw new Error('password selector matched nothing');
      if (!submit) throw new Error('submit selector matched nothing');
      setNative(user, ${JSON.stringify(opts.username)});
      setNative(pass, ${JSON.stringify(opts.password)});
      if (typeof submit.click === 'function') submit.click();
      else submit.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      return true;
    })()`

    await wc.executeJavaScript(script, true)
  }

  zoom(id: string, factor: number): void {
    const tab = this.tabs.get(id)
    if (!tab) return
    tab.zoom = Math.min(3, Math.max(0.25, factor))
    try {
      tab.view.webContents.setZoomFactor(tab.zoom)
    } catch (err) {
      void err
    }
    this.emit()
  }

  /** Toolbar wrench: open embedded DevTools and tell UI to select the tab. */
  toggleDevtools(id: string): void {
    if (this.activeId !== id) this.setActive(id)
    if (this.dtVisible && this.dtAttachedTabId === id && this.dtView) {
      this.setDevtoolsVisible(false)
      return
    }
    this.setDevtoolsVisible(true)
    this.getSender()?.webContents.send('browser:devtools-show', { wsId: this.wsId })
  }

  setDevtoolsBounds(bounds: Rectangle): void {
    this.dtBounds = bounds
    this.applyDtBounds()
  }

  setDevtoolsVisible(v: boolean): void {
    this.dtVisible = v
    if (v) {
      this.attachDevtoolsToActive()
    } else {
      this.destroyDevtoolsHost()
    }
  }

  setBounds(bounds: Rectangle): void {
    this.bounds = bounds
    this.apply()
  }

  setVisible(v: boolean): void {
    this.visible = v
    this.apply()
    this.applyDtBounds()
  }

  dispose(): void {
    this.destroyDevtoolsHost()
    for (const id of [...this.tabs.keys()]) this.closeTab(id)
  }

  snapshot(): BrowserSnapshot {
    return {
      wsId: this.wsId,
      activeId: this.activeId,
      groups: this.groups.map((g) => ({ ...g })),
      tabs: [...this.tabs.values()].map((t) => ({
        id: t.id,
        url: t.url,
        title: t.title,
        favicon: t.favicon,
        loading: t.loading,
        canGoBack: t.canGoBack,
        canGoForward: t.canGoForward,
        zoom: t.zoom,
        groupId: t.groupId
      }))
    }
  }

  private attachDevtoolsToActive(): void {
    const tabId = this.activeId
    if (!tabId || !this.dtVisible) return
    const tab = this.tabs.get(tabId)
    if (!tab) return

    if (this.dtAttachedTabId === tabId && this.dtView) {
      this.applyDtBounds()
      this.raiseDevtools()
      return
    }

    this.destroyDevtoolsHost()

    const win = this.getSender()
    if (!win) return

    const dtView = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false
      }
    })
    dtView.setBackgroundColor('#1a1a1a')
    dtView.setBounds(HIDDEN)
    win.contentView.addChildView(dtView)

    this.dtView = dtView
    this.dtAttachedTabId = tabId

    const wc = tab.view.webContents
    try {
      wc.setDevToolsWebContents(dtView.webContents)
      wc.openDevTools({ mode: 'detach' })
      const kick = (): void => {
        void dtView.webContents.executeJavaScript('window.location.reload()').catch(() => undefined)
      }
      if (dtView.webContents.getURL()) kick()
      else dtView.webContents.once('dom-ready', () => setTimeout(kick, 50))
    } catch (err) {
      void err
      this.destroyDevtoolsHost()
      return
    }

    this.applyDtBounds()
    this.raiseDevtools()
  }

  private destroyDevtoolsHost(): void {
    const attachedId = this.dtAttachedTabId
    const dtView = this.dtView
    this.dtView = null
    this.dtAttachedTabId = null

    if (attachedId) {
      const tab = this.tabs.get(attachedId)
      if (tab) {
        try {
          if (tab.view.webContents.isDevToolsOpened()) tab.view.webContents.closeDevTools()
        } catch (err) {
          void err
        }
      }
    }

    if (dtView) {
      try {
        this.getSender()?.contentView.removeChildView(dtView)
        ;(dtView as unknown as { webContents: { destroy: () => void } }).webContents.destroy()
      } catch (err) {
        void err
      }
    }
  }

  private applyDtBounds(): void {
    if (!this.dtView) return
    const show = this.dtVisible && this.visible && !!this.dtBounds
    this.dtView.setBounds(show ? this.dtBounds! : HIDDEN)
  }

  private raiseDevtools(): void {
    if (!this.dtView) return
    const win = this.getSender()
    if (!win) return
    try {
      win.contentView.removeChildView(this.dtView)
      win.contentView.addChildView(this.dtView)
    } catch (err) {
      void err
    }
  }

  private apply(): void {
    const active = this.activeId ? this.tabs.get(this.activeId) : null
    for (const tab of this.tabs.values()) {
      const show = tab === active && this.visible && !!this.bounds
      tab.view.setBounds(show ? this.bounds! : HIDDEN)
    }
    this.applyDtBounds()
    if (this.dtVisible && this.dtView) this.raiseDevtools()
  }

  private emit(): void {
    this.getSender()?.webContents.send('browser:event', this.snapshot())
  }
}

function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return 'about:blank'
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^[\w-]+(\.[\w-]+)+/.test(trimmed)) return 'https://' + trimmed
  return 'https://www.google.com/search?q=' + encodeURIComponent(trimmed)
}
