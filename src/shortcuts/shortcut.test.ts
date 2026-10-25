import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { dismissTopEscapeLayer, escapeLayerCount, registerEscapeLayer, resetEscapeLayers } from '../ui/escapeLayers'
import { SHORTCUT_GROUPS } from './catalog'
import { acceptsShortcutToggle, shortcutTargetBlocks } from './guard'
import {
  closeShortcutPanel,
  openShortcutPanel,
  resetShortcutPanel,
  shortcutOpen,
  toggleShortcutSession,
} from './session'

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

function key(partial: {
  key?: string
  target?: { tagName?: string; isContentEditable?: boolean; closest?: (selector: string) => unknown } | null
  repeat?: boolean
  altKey?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  isComposing?: boolean
  defaultPrevented?: boolean
}) {
  return {
    key: partial.key ?? '?',
    target: partial.target ?? null,
    repeat: partial.repeat,
    altKey: partial.altKey,
    metaKey: partial.metaKey,
    ctrlKey: partial.ctrlKey,
    isComposing: partial.isComposing,
    defaultPrevented: partial.defaultPrevented,
  }
}

describe('快捷键是否接手', () => {
  it('问号键打开速查，输入框和抽屉聚焦时放过', () => {
    expect(acceptsShortcutToggle(key({ target: null }))).toBe(true)
    expect(acceptsShortcutToggle(key({ target: { tagName: 'CANVAS' } }))).toBe(true)
    expect(acceptsShortcutToggle(key({ key: 'Escape' }))).toBe(false)
    expect(acceptsShortcutToggle(key({ key: '/' }))).toBe(false)
    expect(acceptsShortcutToggle(key({ repeat: true }))).toBe(false)
    expect(acceptsShortcutToggle(key({ ctrlKey: true }))).toBe(false)
    expect(acceptsShortcutToggle(key({ altKey: true }))).toBe(false)
    expect(acceptsShortcutToggle(key({ metaKey: true }))).toBe(false)
    expect(acceptsShortcutToggle(key({ isComposing: true }))).toBe(false)
    expect(acceptsShortcutToggle(key({ defaultPrevented: true }))).toBe(false)

    expect(shortcutTargetBlocks({ tagName: 'INPUT' })).toBe(true)
    expect(shortcutTargetBlocks({ tagName: 'TEXTAREA' })).toBe(true)
    expect(shortcutTargetBlocks({ tagName: 'SELECT' })).toBe(true)
    expect(shortcutTargetBlocks({ tagName: 'DIV', isContentEditable: true })).toBe(true)
    const inDrawer = {
      tagName: 'BUTTON',
      closest: (selector: string) => (selector === 'dialog' ? {} : null),
    }
    expect(shortcutTargetBlocks(inDrawer)).toBe(true)
    expect(acceptsShortcutToggle(key({ target: { tagName: 'INPUT' } }))).toBe(false)
    expect(acceptsShortcutToggle(key({ target: inDrawer }))).toBe(false)

    const sheetButton = { tagName: 'BUTTON', closest: () => null }
    expect(shortcutTargetBlocks(sheetButton)).toBe(false)
    expect(acceptsShortcutToggle(key({ target: sheetButton }))).toBe(true)
  })
})

describe('速查目录', () => {
  it('列出图层、测距、小地图、书签和 Esc，不把 WASD 当成操作', () => {
    expect(SHORTCUT_GROUPS.map((group) => group.id)).toEqual([
      'sheet',
      'scene',
      'focus',
      'search',
      'layers',
      'measure',
      'minimap',
      'bookmarks',
      'fullscreen',
      'alarm',
    ])
    const text = JSON.stringify(SHORTCUT_GROUPS)
    expect(text).toMatch(/图层/)
    expect(text).toMatch(/人流/)
    expect(text).toMatch(/测距/)
    expect(text).toMatch(/小地图/)
    expect(text).toMatch(/书签/)
    expect(text).toMatch(/Esc/)
    expect(text).toMatch(/不接 WASD/)
    expect(text).not.toMatch(/WASD 漫游键|按 W/)
  })
})

describe('速查 Esc 栈', () => {
  beforeEach(() => {
    resetEscapeLayers()
    resetShortcutPanel()
  })

  it('打开后 Esc 只关速查，关完才轮到下面的层', () => {
    const closed: string[] = []
    const dropDrawer = registerEscapeLayer('alarm-drawer', () => {
      closed.push('drawer')
    })
    openShortcutPanel()
    expect(shortcutOpen()).toBe(true)
    expect(escapeLayerCount()).toBe(2)

    expect(dismissTopEscapeLayer()).toBe(true)
    expect(shortcutOpen()).toBe(false)
    expect(closed).toEqual([])
    expect(escapeLayerCount()).toBe(1)

    expect(dismissTopEscapeLayer()).toBe(true)
    expect(closed).toEqual(['drawer'])
    dropDrawer()
    expect(escapeLayerCount()).toBe(0)
    expect(dismissTopEscapeLayer()).toBe(false)
  })

  it('问号再按一次关掉，并卸掉自己的层', () => {
    toggleShortcutSession()
    expect(shortcutOpen()).toBe(true)
    toggleShortcutSession()
    expect(shortcutOpen()).toBe(false)
    expect(escapeLayerCount()).toBe(0)
    expect(dismissTopEscapeLayer()).toBe(false)
  })

  it('重复打开不会叠两层', () => {
    openShortcutPanel()
    openShortcutPanel()
    expect(escapeLayerCount()).toBe(1)
    closeShortcutPanel()
    expect(escapeLayerCount()).toBe(0)
    closeShortcutPanel()
    expect(escapeLayerCount()).toBe(0)
  })
})

describe('速查分包', () => {
  it('问号监听走晚加载入口，面板仍等 ? 才拉，不进首屏静态图', () => {
    const stage = read('../components/Stage.tsx')
    const dock = read('../viewmarks/dock.tsx')
    const arm = read('./arm.ts')
    const guard = read('./guard.ts')
    const catalog = read('./catalog.ts')
    const session = read('./session.ts')
    const sheet = read('./ShortcutSheet.tsx')
    const host = read('./host.tsx')
    const css = read('./shortcut.css')
    const indexCss = read('../index.css')
    const prefetch = read('../scene/stage/prefetchLazyChunks.ts')
    const scene = read('../components/Scene.tsx')
    const app = read('../App.tsx')
    const main = read('../main.tsx')
    const fx = read('../components/scene/postfx/balancedFx.tsx')
    const pkg = read('../../package.json')
    const tree = [guard, catalog, session, sheet, host, css, arm].join('\n')

    expect(stage).not.toMatch(/shortcuts|acceptsShortcutToggle|ShortcutSheet|SHORTCUT_GROUPS/)
    expect(stage).not.toMatch(/测距|minimap|LayerPanel|ViewmarkDock|KeyboardControls/)
    expect(stage).toMatch(/__twinDismissEsc/)
    expect(dock).toMatch(/import\('\.\.\/shortcuts\/arm'\)/)
    expect(dock).not.toMatch(/from '\.\.\/shortcuts\/arm'|shortcuts\/host|ShortcutSheet/)
    expect(arm).toMatch(/import\('\.\/host'\)/)
    expect(arm).not.toMatch(/from '\.\/host'|ShortcutSheet|shortcut\.css/)
    expect(arm).toMatch(/addEventListener\('keydown'/)

    expect(session).toMatch(/LAYER_ID = 'shortcuts'/)
    expect(session).toMatch(/registerEscapeLayer\(LAYER_ID/)
    expect(session).not.toMatch(/keydown/)
    expect(host).toMatch(/shortcut\.css\?inline/)
    expect(host).toMatch(/toggleShortcutSession/)
    expect(host).not.toMatch(/addEventListener\('keydown'/)
    expect(sheet).toMatch(/data-shortcut-root/)
    expect(sheet).not.toMatch(/Escape|keydown/)

    expect(prefetch).not.toMatch(/shortcuts/)
    expect(scene).not.toMatch(/shortcuts/)
    expect(app).not.toMatch(/shortcuts/)
    expect(main).not.toMatch(/shortcuts/)
    expect(fx).not.toMatch(/shortcuts/)
    expect(indexCss).not.toMatch(/shortcut-sheet|shortcut-host/)

    expect(tree).not.toMatch(/KeyboardControls|@react-three|balancedFx|from 'three'|zustand/)
    expect(pkg).not.toMatch(/keyboard-controls/i)
    const dependencies = Object.keys(JSON.parse(pkg).dependencies as Record<string, string>).sort()
    expect(dependencies).toEqual([
      '@react-three/drei',
      '@react-three/fiber',
      '@react-three/postprocessing',
      'postprocessing',
      'react',
      'react-dom',
      'three',
      'troika-three-text',
      'troika-three-utils',
      'troika-worker-utils',
      'zustand',
    ])
  })
})
