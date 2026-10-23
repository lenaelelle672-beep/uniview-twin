import { registerEscapeLayer } from '../ui/escapeLayers'

declare global {
  interface Window {
    __twinShortcutOpen?: boolean
  }
}

const LAYER_ID = 'shortcuts'

let open = false
let drop: (() => void) | null = null
const listeners = new Set<(value: boolean) => void>()

function publish() {
  if (typeof window !== 'undefined') window.__twinShortcutOpen = open
  for (const listener of listeners) listener(open)
}

export function shortcutOpen(): boolean {
  return open
}

export function subscribeShortcut(listener: (value: boolean) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function closeShortcutPanel(): void {
  if (!open && drop == null) return
  open = false
  const current = drop
  drop = null
  current?.()
  publish()
}

export function openShortcutPanel(): void {
  if (open) return
  open = true
  drop = registerEscapeLayer(LAYER_ID, closeShortcutPanel)
  publish()
}

export function toggleShortcutSession(): void {
  if (open) closeShortcutPanel()
  else openShortcutPanel()
}

export function resetShortcutPanel(): void {
  open = false
  const current = drop
  drop = null
  current?.()
  if (typeof window !== 'undefined') window.__twinShortcutOpen = false
}
