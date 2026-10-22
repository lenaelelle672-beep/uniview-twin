import { acceptsShortcutToggle } from './guard'

let armed = false

function onShortcutKey(event: KeyboardEvent) {
  if (!acceptsShortcutToggle(event)) return
  event.preventDefault()
  void import('./host').then((mod) => {
    mod.toggleShortcutPanel()
  })
}

/** dock 晚加载之后才挂上。host 仍要等到 ? 才 import。 */
export function armShortcutKeys(): void {
  if (armed || typeof window === 'undefined') return
  armed = true
  window.addEventListener('keydown', onShortcutKey)
}

armShortcutKeys()
