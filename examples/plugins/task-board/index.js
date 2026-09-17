const pending = new Map()
let workspace = null
let tasks = []

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`

function call(method, params = {}) {
  const id = newId()
  parent.postMessage({ source: 'mxwl-plugin', type: 'request', id, method, params }, '*')
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

function fail(error) {
  const box = document.querySelector('#error')
  box.textContent = error instanceof Error ? error.message : String(error)
  box.style.display = 'block'
}

async function save() {
  if (!workspace) return
  await call('storage.set', { key: `tasks:${workspace.id}`, value: tasks })
}

function render() {
  const board = document.querySelector('#board')
  board.replaceChildren()
  const open = tasks.filter((task) => !task.done).length
  document.querySelector('#count').textContent = `${open} open`
  if (!tasks.length) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = 'No tasks yet. Add one or enjoy the suspicious calm.'
    board.append(empty)
    return
  }
  for (const task of tasks) {
    const row = document.createElement('article')
    row.className = `task${task.done ? ' done' : ''}`
    const check = document.createElement('button')
    check.className = 'check'
    check.textContent = task.done ? '✓' : ''
    check.title = task.done ? 'Mark open' : 'Mark done'
    check.onclick = async () => {
      task.done = !task.done
      render()
      await save().catch(fail)
    }
    const title = document.createElement('div')
    title.className = 'title'
    title.textContent = task.title
    const actions = document.createElement('div')
    actions.className = 'actions'
    const handoff = document.createElement('button')
    handoff.textContent = 'Ask agent'
    handoff.onclick = () =>
      call('agent.prompt', {
        text: `Take this workspace task: ${task.title}. Inspect the current state, propose a concise plan, then implement and verify it.`
      }).catch(fail)
    const remove = document.createElement('button')
    remove.textContent = '×'
    remove.title = 'Delete task'
    remove.onclick = async () => {
      tasks = tasks.filter((candidate) => candidate.id !== task.id)
      render()
      await save().catch(fail)
    }
    actions.append(handoff, remove)
    row.append(check, title, actions)
    board.append(row)
  }
}

async function load(nextWorkspace) {
  workspace = nextWorkspace
  document.querySelector('#context').textContent =
    `${workspace.title} · ${workspace.branch || workspace.remotePath}`
  tasks =
    (await call('storage.get', { key: `tasks:${workspace.id}` }).catch((error) => {
      fail(error)
      return []
    })) || []
  render()
}

addEventListener('message', (event) => {
  const message = event.data
  if (message?.source !== 'mxwl-host') return
  if (message.type === 'response') {
    const request = pending.get(message.id)
    if (!request) return
    pending.delete(message.id)
    message.error ? request.reject(new Error(message.error)) : request.resolve(message.result)
  } else if (message.type === 'ready' || message.type === 'context') {
    void load(message.workspace)
  }
})

parent.postMessage({ source: 'mxwl-plugin', type: 'ready' }, '*')

document.querySelector('#add').addEventListener('click', async () => {
  const input = document.querySelector('#title')
  const title = input.value.trim()
  if (!title || !workspace) return
  tasks.unshift({ id: newId(), title, done: false })
  input.value = ''
  render()
  await save().catch(fail)
})
