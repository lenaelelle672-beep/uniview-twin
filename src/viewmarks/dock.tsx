import { lazy, Suspense } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { mountAlarmTimeline } from '../components/AlarmTimelineGate'
import { ViewmarkDock } from './ViewmarkDock'

// T046：小地图跟这条晚加载入口走，不进首屏 hardGate / balancedFx。
void import('../minimap/mount')

const LayerPanel = lazy(() => import('./LayerPanel').then((mod) => ({ default: mod.LayerPanel })))

let root: Root | null = null
let host: HTMLElement | null = null
let mountMeasure: (() => void) | null = null

function mountMeasureSoon() {
  if (mountMeasure) {
    mountMeasure()
    return
  }
  void import('../measure/boot').then((mod) => {
    mountMeasure = mod.mountMeasure
    mountMeasure()
  })
}

function mount() {
  mountAlarmTimeline()
  mountMeasureSoon()
  if (host && !host.isConnected) {
    root?.unmount()
    root = null
    host = null
  }
  const next = document.querySelector<HTMLElement>('[data-vm]')
  if (!next || next === host) return
  host = next
  root?.unmount()
  root = createRoot(next)
  root.render(
    <div className="viewmark-row">
      <Suspense fallback={null}>
        <LayerPanel />
      </Suspense>
      <ViewmarkDock />
    </div>,
  )
}

mount()
const observer = new MutationObserver(mount)
observer.observe(document.body, { childList: true, subtree: true })
