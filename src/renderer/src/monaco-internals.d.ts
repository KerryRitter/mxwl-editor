// Narrow declarations for the Monaco 0.52 hover-service compatibility adapter.
// The public editor API remains fully typed by monaco-editor's own declarations.
declare module 'monaco-editor/esm/vs/base/browser/ui/hover/hoverDelegateFactory.js' {
  export function setHoverDelegateFactory(
    factory: (placement: string, instant: boolean) => unknown
  ): void
}
declare module 'monaco-editor/esm/vs/editor/standalone/browser/standaloneServices.js' {
  export const StandaloneServices: {
    get(id: unknown): {
      createInstance(constructor: unknown, ...args: unknown[]): unknown
    }
  }
}
declare module 'monaco-editor/esm/vs/platform/instantiation/common/instantiation.js' {
  export const IInstantiationService: unknown
}
declare module 'monaco-editor/esm/vs/platform/hover/browser/hover.js' {
  export const WorkbenchHoverDelegate: unknown
}
