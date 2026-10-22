import { createElement, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { ShortcutSheet } from './ShortcutSheet'
import {
  closeShortcutPanel,
  shortcutOpen,
  subscribeShortcut,
  toggleShortcutSession,
} from './session'
import css from './shortcut.css?inline'

let root: Root | null = null
let host: HTMLElement | null = null
let observer: MutationObserver | null = null
let styled = false

function ensureCss() {
  if (styled || typeof document === 'undefined') return
  styled = true
  const node = document.createElement('style')
  node.dataset.shortcut = ''
  node.textContent = css
  document.head.append(node)
}

function ensureMounted() {
  if (typeof document === 'undefined') return
  ensureCss()
  if (host && !host.isConnected) {
    root?.unmount()
    root = null
    host = null
  }
  if (host && root) return
  const stage = document.querySelector('main.stage')
  if (!stage) return
  const next = document.createElement('div')
  next.className = 'shortcut-host'
  next.dataset.shortcutHost = ''
  stage.appendChild(next)
  host = next
  root = createRoot(next)
  root.render(createElement(SheetRoot))
  watchStage()
}

function watchStage() {
  if (observer || typeof document === 'undefined') return
  observer = new MutationObserver(() => {
    if (!shortcutOpen()) return
    if (host?.isConnected) return
    ensureMounted()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

function SheetRoot() {
  const [shown, setShown] = useState(shortcutOpen)
  useEffect(() => subscribeShortcut(setShown), [])
  if (!shown) return null
  return <ShortcutSheet onClose={closeShortcutPanel} />
}

/** 按下 ? 之后才加载。Esc 不在这里监听，走 escapeLayers。 */
export function toggleShortcutPanel(): void {
  toggleShortcutSession()
  ensureMounted()
}
