import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

type ModalProps = {
  title: string
  onClose: () => void
  children: ReactNode
  width?: number
}

export function Modal({
  title,
  onClose,
  children,
  width = 520
}: ModalProps): JSX.Element {
  const overlay = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        const modals = document.querySelectorAll('[data-mxwl-modal]')
        if (modals[modals.length - 1] !== overlay.current) return
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div
      ref={overlay}
      data-mxwl-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width }}
        className="max-h-[85vh] overflow-auto rounded-xl border border-neutral-800 bg-neutral-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            title="Close (Esc)"
            className="text-neutral-500 hover:text-neutral-200"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
