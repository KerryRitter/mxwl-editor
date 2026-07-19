import { useEffect, useRef, type FC } from 'react'

/** Host slot for native Chromium DevTools (Elements / Network / Console / …). */
export const DevToolsPanel: FC<{ wsId: string }> = ({ wsId }) => {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sendBounds = (): void => {
      const el = hostRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) return
      void window.api.browser.setDevtoolsBounds(wsId, {
        x: Math.round(r.left),
        y: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height)
      })
    }

    void window.api.browser.setDevtoolsVisible(wsId, true)
    const ro = new ResizeObserver(() => sendBounds())
    if (hostRef.current) ro.observe(hostRef.current)
    const raf = requestAnimationFrame(sendBounds)
    const onWinResize = (): void => sendBounds()
    window.addEventListener('resize', onWinResize)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('resize', onWinResize)
      void window.api.browser.setDevtoolsVisible(wsId, false)
    }
  }, [wsId])

  return (
    <div className="relative h-full w-full bg-neutral-950">
      <div ref={hostRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[11px] text-neutral-700">
        Loading DevTools…
      </div>
    </div>
  )
}
