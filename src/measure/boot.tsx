import { createElement, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { useTwinStore } from '../store/store'
import { measureSessionKey } from './measurePick'
import css from './measure.css?inline'

function waitForSlot(node: ReactNode, cancelled: () => boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const started = performance.now()
    const tick = () => {
      if (cancelled()) {
        resolve(false)
        return
      }
      const slot = window.__twinMeasureSlot
      if (slot) {
        slot(node)
        resolve(true)
        return
      }
      if (performance.now() - started > 20_000) {
        resolve(false)
        return
      }
      window.setTimeout(tick, 50)
    }
    tick()
  })
}

function MeasureButton() {
  const view = useTwinStore((state) => state.view)
  const floor = useTwinStore((state) => state.selectedFloor)
  const exploded = useTwinStore((state) => state.exploded)
  const [on, setOn] = useState(false)
  const [ready, setReady] = useState(() => window.__twinMeasureSlot != null)
  const waitGen = useRef(0)
  const session = measureSessionKey(view, floor, exploded)
  const sessionRef = useRef(session)

  const exitMeasure = useCallback(() => {
    waitGen.current += 1
    setOn(false)
    window.__twinMeasureSlot?.(null)
  }, [])

  useEffect(() => {
    const node = document.createElement('style')
    node.dataset.measure = ''
    node.textContent = css
    document.head.append(node)
    return () => node.remove()
  }, [])

  useEffect(() => {
    window.__twinMeasureExit = exitMeasure
    return () => {
      if (window.__twinMeasureExit === exitMeasure) delete window.__twinMeasureExit
    }
  }, [exitMeasure])

  useEffect(() => {
    if (sessionRef.current === session) return
    sessionRef.current = session
    exitMeasure()
  }, [exitMeasure, session])

  useEffect(() => {
    if (ready) return
    let stop = false
    const tick = () => {
      if (stop) return
      if (window.__twinMeasureSlot) {
        setReady(true)
        return
      }
      window.setTimeout(tick, 200)
    }
    tick()
    return () => {
      stop = true
    }
  }, [ready])

  async function enable() {
    const gen = waitGen.current + 1
    waitGen.current = gen
    const { MeasureTool } = await import('./MeasureTool')
    if (gen !== waitGen.current) return
    const ok = await waitForSlot(createElement(MeasureTool), () => gen !== waitGen.current)
    if (!ok || gen !== waitGen.current) return
    setOn(true)
  }

  if (view === 'blueprint') return null

  return (
    <button
      type="button"
      className={on ? 'measure-toggle is-active' : 'measure-toggle'}
      aria-label={on ? '退出测距' : '测距'}
      aria-pressed={on}
      disabled={!ready}
      title="两点测距，Esc 退出"
      onClick={() => {
        if (on) exitMeasure()
        else void enable()
      }}
    >
      测距
    </button>
  )
}

let root: Root | null = null
let host: HTMLElement | null = null

/** 挂进 .stage。调用方是 viewmarks/dock，总览上晚于首帧 2600ms，不进 hardGate。 */
export function mountMeasure(): void {
  if (typeof document === 'undefined') return
  if (host && !host.isConnected) {
    root?.unmount()
    root = null
    host = null
  }
  if (host?.isConnected) return
  const stage = document.querySelector('.stage')
  if (!stage) return
  const next = document.createElement('div')
  next.dataset.measureHost = ''
  stage.appendChild(next)
  host = next
  root = createRoot(next)
  root.render(createElement(MeasureButton))
}
