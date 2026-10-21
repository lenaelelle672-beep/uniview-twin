import { createRoot, type Root } from 'react-dom/client'
import { mountAlarmTimeline } from '../components/AlarmTimelineGate'
import { ViewmarkDock } from './ViewmarkDock'

// T046：小地图跟这条晚加载入口走，不进首屏 hardGate / balancedFx。
void import('../minimap/mount')

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
  root.render(<ViewmarkDock />)
}

mount()
const observer = new MutationObserver(mount)
observer.observe(document.body, { childList: true, subtree: true })
