import { createRoot, type Root } from 'react-dom/client'
import { ViewmarkDock } from './ViewmarkDock'

let root: Root | null = null
let host: HTMLElement | null = null

function mount() {
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
