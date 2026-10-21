import { createRoot, type Root } from 'react-dom/client'
import { useTwinStore } from '../store/store'
import { FloorMinimap } from './FloorMinimap'
import css from './minimap.css?inline'

let root: Root | null = null
let host: HTMLElement | null = null

function ensureCss() {
  if (document.querySelector('style[data-minimap]')) return
  const node = document.createElement('style')
  node.dataset.minimap = ''
  node.textContent = css
  document.head.append(node)
}

export function mountFloorMinimap(): void {
  if (typeof document === 'undefined') return
  if (host && !host.isConnected) {
    root?.unmount()
    root = null
    host = null
  }
  if (host?.isConnected) return
  const stage = document.querySelector('.stage')
  if (!stage) return
  ensureCss()
  const next = document.createElement('div')
  next.dataset.minimapHost = ''
  next.className = 'minimap-host'
  next.style.pointerEvents = 'none'
  next.hidden = useTwinStore.getState().view !== 'floor'
  stage.appendChild(next)
  host = next
  root = createRoot(next)
  root.render(<FloorMinimap />)
}

if (typeof document !== 'undefined' && document.body) {
  mountFloorMinimap()
  const observer = new MutationObserver(() => {
    mountFloorMinimap()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}
