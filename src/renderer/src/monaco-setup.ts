import * as monaco from 'monaco-editor'
import { setHoverDelegateFactory } from 'monaco-editor/esm/vs/base/browser/ui/hover/hoverDelegateFactory.js'
import { StandaloneServices } from 'monaco-editor/esm/vs/editor/standalone/browser/standaloneServices.js'
import { IInstantiationService } from 'monaco-editor/esm/vs/platform/instantiation/common/instantiation.js'
import { WorkbenchHoverDelegate } from 'monaco-editor/esm/vs/platform/hover/browser/hover.js'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

const env: monaco.Environment = {
  getWorker(_workerId: string, label: string): Worker {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less')
      return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor')
      return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  }
}

;(
  self as unknown as { MonacoEnvironment: monaco.Environment }
).MonacoEnvironment = env

monaco.editor.defineTheme('mxwl-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: { 'editor.background': '#0a0a0a' }
})

export { monaco }

// Monaco 0.52 installs a global hover factory from each diff child editor's
// short-lived instantiation service. Disposing that diff leaves other editors'
// lazy suggestion/action widgets pointing at a dead service. Keep this shared
// factory on the renderer-lifetime standalone service, before and after creating
// or destroying any editor. Internal imports are isolated here and covered by
// real-browser lifecycle tests (including plugin disable/re-enable).
function stabilizeHoverService(): void {
  const service = StandaloneServices.get(IInstantiationService)
  setHoverDelegateFactory((placement, instant) =>
    service.createInstance(WorkbenchHoverDelegate, placement, instant, {})
  )
}

export function createCodeEditor(
  container: HTMLElement,
  options: monaco.editor.IStandaloneEditorConstructionOptions
): monaco.editor.IStandaloneCodeEditor {
  stabilizeHoverService()
  const editor = monaco.editor.create(container, options)
  stabilizeHoverService()
  return editor
}

export function createDiffEditor(
  container: HTMLElement,
  options: monaco.editor.IStandaloneDiffEditorConstructionOptions
): monaco.editor.IStandaloneDiffEditor {
  stabilizeHoverService()
  const editor = monaco.editor.createDiffEditor(container, options)
  stabilizeHoverService()
  return editor
}

export function disposeEditor(
  editor:
    monaco.editor.IStandaloneCodeEditor | monaco.editor.IStandaloneDiffEditor
): void {
  stabilizeHoverService()
  editor.setModel(null)
  editor.dispose()
  stabilizeHoverService()
}
