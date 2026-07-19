import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[mxwl] renderer crash', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-3 bg-neutral-950 px-6 text-center text-neutral-200">
          <p className="text-sm font-medium text-red-400">Something crashed in the UI</p>
          <pre className="max-w-xl overflow-auto rounded border border-neutral-800 bg-neutral-900 p-3 text-left text-[11px] text-neutral-400">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs text-white hover:bg-emerald-500"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
