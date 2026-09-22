export const MXWL_PLUGIN_SDK_PATH = '__mxwl/sdk/v1.js'

/** Browser SDK served inside every enabled plugin origin. */
export const MXWL_PLUGIN_SDK_V1 = String.raw`(() => {
  const pending = new Map()
  const contextListeners = new Set()
  const visibilityListeners = new Set()
  let context = null
  let visible = true
  let receivedVisibility = false

  const notify = (listeners, value) => {
    for (const listener of listeners) {
      try { listener(value) } catch (error) { setTimeout(() => { throw error }, 0) }
    }
  }

  const call = (method, params = {}) => {
    const id = crypto.randomUUID()
    parent.postMessage({ source: 'mxwl-plugin', type: 'request', id, method, params }, '*')
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error('mxwl plugin request timed out'))
      }, 30000)
      pending.set(id, { resolve, reject, timer })
    })
  }

  addEventListener('message', (event) => {
    if (event.source !== parent || event.data?.source !== 'mxwl-host') return
    const message = event.data
    if (message.type === 'response') {
      const request = pending.get(message.id)
      if (!request) return
      pending.delete(message.id)
      clearTimeout(request.timer)
      message.error ? request.reject(new Error(message.error)) : request.resolve(message.result)
      return
    }
    if (message.type === 'ready' || message.type === 'context') {
      context = Object.freeze({
        apiVersion: message.apiVersion,
        pluginId: message.pluginId,
        contributionId: message.contributionId,
        workspace: Object.freeze({ ...message.workspace })
      })
      notify(contextListeners, context)
      return
    }
    if (message.type === 'visibility') {
      visible = Boolean(message.visible)
      receivedVisibility = true
      notify(visibilityListeners, visible)
    }
  })

  const client = Object.freeze({
    apiVersion: 1,
    call,
    getContext: () => context,
    isVisible: () => visible,
    onContext: (listener) => {
      contextListeners.add(listener)
      if (context) queueMicrotask(() => listener(context))
      return () => contextListeners.delete(listener)
    },
    onVisibility: (listener) => {
      visibilityListeners.add(listener)
      if (receivedVisibility) queueMicrotask(() => listener(visible))
      return () => visibilityListeners.delete(listener)
    }
  })

  Object.defineProperty(window, 'mxwl', { value: client, enumerable: true })
  parent.postMessage({ source: 'mxwl-plugin', type: 'ready' }, '*')
})()`
