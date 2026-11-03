import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { VISUAL_VIEWPORT_SOURCE_BLOCK } from '../../scripts/visualViewportPlugin'
import { FOG_DENSITY } from '../scene/fog'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { HUD_SHEET, applyHudViewport, clearHudViewport, type HudStyleTarget } from './hud'
import {
  VIEWPORT_SLACK_PX,
  hudCssVars,
  identityViewport,
  readHudViewport,
  readLayoutBox,
  readVisualBox,
  type LayoutBox,
  type VisualBox,
  type VisualViewportSnapshot,
} from './metrics'
import { bindVisualViewport, mountVisualViewportHud, type ViewportEnv, type ViewportListenerTarget } from './mount'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

function box(width: number, height: number, offsetLeft = 0, offsetTop = 0): VisualBox {
  return { width, height, offsetLeft, offsetTop }
}

function frame(width: number, height: number): LayoutBox {
  return { width, height }
}

function fakeHud() {
  const props = new Map<string, string>()
  const attrs = new Map<string, string>()
  let writes = 0
  const node: HudStyleTarget & { props: Map<string, string>; writes: () => number } = {
    props,
    writes: () => writes,
    style: {
      setProperty(name, value) {
        writes += 1
        props.set(name, value)
      },
      removeProperty(name) {
        props.delete(name)
      },
    },
    setAttribute(name, value) {
      attrs.set(name, value)
    },
    removeAttribute(name) {
      attrs.delete(name)
    },
    getAttribute(name) {
      return attrs.get(name) ?? null
    },
  }
  return node
}

function fakeViewport(initial: VisualBox) {
  let current = { ...initial }
  const listeners = new Map<string, Set<() => void>>()
  const api: ViewportListenerTarget & {
    set(next: Partial<VisualBox>): void
    fire(type: 'resize' | 'scroll'): void
    count(type: 'resize' | 'scroll'): number
  } = {
    get width() {
      return current.width
    },
    get height() {
      return current.height
    },
    get offsetLeft() {
      return current.offsetLeft
    },
    get offsetTop() {
      return current.offsetTop
    },
    set(next) {
      current = { ...current, ...next }
    },
    addEventListener(type, listener) {
      const set = listeners.get(type) ?? new Set()
      set.add(listener)
      listeners.set(type, set)
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener)
    },
    fire(type) {
      for (const listener of listeners.get(type) ?? []) listener()
    },
    count(type) {
      return listeners.get(type)?.size ?? 0
    },
  }
  return api
}

describe('visualViewport 读数', () => {
  it('缺 API、非数字或空尺寸时不产出留白', () => {
    expect(readVisualBox(null)).toBeNull()
    expect(readVisualBox(undefined)).toBeNull()
    expect(readLayoutBox(null)).toBeNull()
    expect(readVisualBox(box(Number.NaN, 800))).toBeNull()
    expect(readVisualBox(box(0, 800))).toBeNull()
    expect(readLayoutBox(frame(1366, 0))).toBeNull()
    expect(readHudViewport(null, frame(1366, 768))).toBeNull()
    expect(readHudViewport(box(1366, 768), null)).toBeNull()
  })

  it('和布局视口重合时留白为 0，1px 内仍算重合', () => {
    expect(VIEWPORT_SLACK_PX).toBe(1)
    const same = readHudViewport(box(1366, 768), frame(1366, 768))
    expect(same?.identity).toBe(true)
    expect(same && hudCssVars(same)).toMatchObject({
      '--vv-w': '1366px',
      '--vv-h': '768px',
      '--vv-x': '0px',
      '--vv-y': '0px',
      '--vv-r': '0px',
      '--vv-b': '0px',
    })
    const slack = readHudViewport(box(1365, 767, 1, 1), frame(1366, 768))
    expect(slack?.identity).toBe(true)
    expect(slack?.insetRight).toBe(0)
    expect(slack?.insetBottom).toBe(0)
  })

  it('offset 和变矮的视觉视口写成四边留白，回弹不推 HUD', () => {
    const keyboard = readHudViewport(box(390, 520, 0, 18), frame(390, 844))
    expect(keyboard).toMatchObject({
      offsetLeft: 0,
      offsetTop: 18,
      insetLeft: 0,
      insetTop: 18,
      insetRight: 0,
      insetBottom: 306,
      identity: false,
    })
    expect(keyboard && hudCssVars(keyboard)['--vv-b']).toBe('306px')
    expect(keyboard && hudCssVars(keyboard)['--vv-y']).toBe('18px')

    const pinch = readHudViewport(box(800, 600, 40, 24), frame(1366, 768))
    expect(pinch).toMatchObject({
      insetLeft: 40,
      insetTop: 24,
      insetRight: 526,
      insetBottom: 144,
      identity: false,
    })

    const bounce = readHudViewport(box(1366, 768, -30, -12), frame(1366, 768))
    expect(bounce?.identity).toBe(true)
    expect(bounce?.offsetLeft).toBe(-30)
    expect(bounce?.insetLeft).toBe(0)
    expect(bounce?.insetRight).toBe(0)
  })

  it('全屏只保留读数，不留下白', () => {
    const raw = box(1920, 1080, 12, 40)
    expect(identityViewport(raw)).toMatchObject({
      width: 1920,
      height: 1080,
      offsetLeft: 12,
      offsetTop: 40,
      insetLeft: 0,
      insetBottom: 0,
      identity: true,
    })
  })
})

describe('HUD 变量', () => {
  it('重合时写变量并拿掉 data-vv，有留白才打开位移', () => {
    const node = fakeHud()
    const same = readHudViewport(box(1366, 768), frame(1366, 768))
    if (!same) throw new Error('missing')
    applyHudViewport(node, same)
    expect(node.getAttribute('data-vv')).toBeNull()
    expect(node.props.get('--vv-w')).toBe('1366px')
    expect(node.props.get('--vv-x')).toBe('0px')

    const shifted = readHudViewport(box(390, 520, 0, 18), frame(390, 844))
    if (!shifted) throw new Error('missing')
    applyHudViewport(node, shifted)
    expect(node.getAttribute('data-vv')).toBe('1')
    expect(node.props.get('--vv-h')).toBe('520px')
    expect(node.props.get('--vv-b')).toBe('306px')

    applyHudViewport(node, same)
    expect(node.getAttribute('data-vv')).toBeNull()
    clearHudViewport(node)
    expect(node.props.size).toBe(0)
    expect(node.getAttribute('data-vv')).toBeNull()
  })

  it('样式只在有留白时改 HUD，不改画布盒子', () => {
    const rules = HUD_SHEET.split('}').map((rule) => rule.trim()).filter(Boolean)
    expect(rules.length).toBeGreaterThan(8)
    for (const rule of rules) expect(rule).toContain('[data-vv="1"]')
    expect(HUD_SHEET).not.toMatch(/\.stage|\.scene-root|\.workspace|canvas|100vh|100vw/)
    expect(HUD_SHEET).not.toMatch(/(?<!max-)(?:width|height)\s*:/)
    expect(HUD_SHEET).toMatch(/--vv-x/)
    expect(HUD_SHEET).toMatch(/--vv-y/)
    expect(HUD_SHEET).toMatch(/--vv-r/)
    expect(HUD_SHEET).toMatch(/--vv-b/)
    expect(HUD_SHEET).toMatch(/\.topbar/)
    expect(HUD_SHEET).toMatch(/\.alarm-drawer/)
    expect(HUD_SHEET).toMatch(/\.viewmark-row/)
    expect(HUD_SHEET).toMatch(/\.viewmark-dock/)
  })
})

describe('监听', () => {
  function harness(options?: {
    visual?: ViewportListenerTarget | null
    resizeObserver?: ViewportEnv['ResizeObserver']
    layoutTarget?: object | null
  }) {
    const hud = fakeHud()
    const owned = options && 'visual' in options ? null : fakeViewport(box(1366, 768))
    const visual = options && 'visual' in options ? options.visual ?? null : owned
    const observed: unknown[] = []
    const Observer =
      options && 'resizeObserver' in options
        ? options.resizeObserver ?? null
        : class {
            constructor(private readonly callback: () => void) {}
            observe(target: object) {
              observed.push(target)
            }
            disconnect() {
              observed.push('off')
            }
            poke() {
              this.callback()
            }
          }
    let layout = frame(1366, 768)
    let fullscreen = false
    let sheets = 0
    let removed = 0
    const published: Array<VisualViewportSnapshot | null> = []
    const layoutTarget = options && 'layoutTarget' in options ? options.layoutTarget ?? null : { kind: 'documentElement' }
    const env: ViewportEnv = {
      visualViewport: visual,
      ResizeObserver: Observer,
      hud,
      layoutTarget,
      layout: () => layout,
      fullscreen: () => fullscreen,
      installSheet: () => {
        sheets += 1
      },
      removeSheet: () => {
        removed += 1
      },
      publish: (snapshot) => {
        published.push(snapshot)
      },
    }
    return {
      hud,
      visual: owned,
      observed,
      env,
      published,
      sheets: () => sheets,
      removed: () => removed,
      setLayout(next: LayoutBox) {
        layout = next
      },
      setFullscreen(next: boolean) {
        fullscreen = next
      },
    }
  }

  it('没有 visualViewport 时不观察、不写样式', () => {
    const rig = harness({ visual: null })
    const stop = bindVisualViewport(rig.env)
    expect(rig.observed).toEqual([])
    expect(rig.sheets()).toBe(0)
    expect(rig.hud.props.size).toBe(0)
    expect(() => stop()).not.toThrow()
    expect(rig.removed()).toBe(0)
  })

  it('没有 ResizeObserver 时仍跟着 visualViewport 写变量', () => {
    const rig = harness({ resizeObserver: null })
    const stop = bindVisualViewport(rig.env)
    expect(rig.observed).toEqual([])
    expect(rig.sheets()).toBe(1)
    expect(rig.hud.getAttribute('data-vv')).toBeNull()
    expect(rig.hud.props.get('--vv-w')).toBe('1366px')
    expect(rig.published.at(-1)).toMatchObject({ identity: true, width: 1366 })
    const visual = rig.visual
    if (!visual) throw new Error('missing viewport')
    const writes = rig.hud.writes()
    visual.fire('resize')
    expect(rig.hud.writes()).toBe(writes)
    visual.set({ height: 520, offsetTop: 18 })
    rig.setLayout(frame(1366, 844))
    visual.fire('scroll')
    expect(rig.hud.getAttribute('data-vv')).toBe('1')
    expect(rig.hud.props.get('--vv-y')).toBe('18px')
    expect(rig.hud.props.get('--vv-b')).toBe('306px')
    expect(rig.published.at(-1)).toMatchObject({ offsetTop: 18, insetBottom: 306, identity: false })
    stop()
    expect(visual.count('resize')).toBe(0)
    expect(visual.count('scroll')).toBe(0)
    expect(rig.hud.props.size).toBe(0)
    expect(rig.removed()).toBe(1)
    expect(rig.published.at(-1)).toBeNull()
    visual.set({ height: 400 })
    visual.fire('resize')
    expect(rig.hud.props.size).toBe(0)
  })

  it('ResizeObserver 看布局根，不看画布；全屏时清掉位移', () => {
    const rig = harness()
    const stop = bindVisualViewport(rig.env)
    expect(rig.observed).toEqual([rig.env.layoutTarget])
    const visual = rig.visual
    if (!visual) throw new Error('missing viewport')
    visual.set({ width: 800, offsetLeft: 40 })
    rig.setFullscreen(true)
    visual.fire('resize')
    expect(rig.hud.getAttribute('data-vv')).toBeNull()
    expect(rig.hud.props.get('--vv-x')).toBe('0px')
    expect(rig.published.at(-1)).toMatchObject({ offsetLeft: 40, insetLeft: 0, identity: true })
    rig.setFullscreen(false)
    visual.fire('resize')
    expect(rig.hud.getAttribute('data-vv')).toBe('1')
    expect(rig.hud.props.get('--vv-x')).toBe('40px')
    stop()
    expect(rig.observed).toContain('off')
  })

  it('ResizeObserver 构造失败时仍保留 visualViewport', () => {
    class Boom {
      constructor() {
        throw new Error('no-observer')
      }
      observe() {}
      disconnect() {}
    }
    const rig = harness({ resizeObserver: Boom })
    expect(() => bindVisualViewport(rig.env)).not.toThrow()
    expect(rig.hud.props.get('--vv-h')).toBe('768px')
    expect(rig.sheets()).toBe(1)
  })

  it('节点环境直接挂载也不抛', () => {
    expect(mountVisualViewportHud).toBeTypeOf('function')
    expect(() => mountVisualViewportHud()).not.toThrow()
  })
})

describe('分包不进首屏', () => {
  it('懒挂在 dock 哈希之后，不碰全屏、书签和 CameraRig', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(read('../scene/stage/cameraTransition.ts')).toMatch(/USER_CAMERA_SMOOTH_TIME = 0\.42/)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)

    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const hud = read('./hud.ts')
    const metrics = read('./metrics.ts')
    const plugin = read('../../scripts/visualViewportPlugin.ts')
    const vite = read('../../vite.config.ts')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }

    expect(dock).toContain(VISUAL_VIEWPORT_SOURCE_BLOCK)
    expect(dock).toMatch(/mountKenneyFurniture\(\)\n\}\)\n\/\/ T105：楼层\/视图的 DOM 过渡/)
    expect(dock).toMatch(/import\('\.\.\/visual-viewport\/mount'\)/)
    expect(dock).toMatch(/mountVisualViewportHud\(\)/)
    expect(dock).not.toMatch(/from '\.\.\/visual-viewport\/mount'/)
    expect(dock.replace(VISUAL_VIEWPORT_SOURCE_BLOCK, '')).not.toMatch(/visual-viewport|mountVisualViewportHud/)
    expect(plugin).toContain(VISUAL_VIEWPORT_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'visual-viewport-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/VisualViewport\.js/)
    const plugins = vite.slice(vite.lastIndexOf('plugins: ['))
    expect(plugins.indexOf('kenneyFurnitureAfterHash()')).toBeLessThan(plugins.indexOf('visualViewportAfterHash()'))
    expect(plugins.indexOf('visualViewportAfterHash()')).toBeLessThan(plugins.indexOf('isolateTransformControlsLeaves()'))

    expect(mount).toMatch(/window\.visualViewport/)
    expect(mount).toMatch(/addEventListener\('resize'/)
    expect(mount).toMatch(/addEventListener\('scroll'/)
    expect(mount).toMatch(/ResizeObserver/)
    expect(mount).toMatch(/documentElement/)
    expect(mount).toMatch(/querySelector\('\.app'\)/)
    expect(mount).toMatch(/innerWidth/)
    expect(mount).toMatch(/innerHeight/)
    expect(mount).toMatch(/fullscreenElement/)
    expect(mount).not.toMatch(/window\.addEventListener/)
    expect(mount).not.toMatch(/fullscreenchange|requestFullscreen|exitFullscreen/)
    expect(mount).not.toMatch(/CameraRig|setLookAt|setSize|cameraTransition|smoothTime/)
    expect(mount).not.toMatch(/console\./)

    const blob = [mount, hud, metrics].join('\n')
    expect(blob).not.toMatch(
      /from ['"][^'"]*(fullscreen|viewmarks|CameraRig|cameraTransition|fog|balancedFx|three|zustand|postprocessing)/,
    )
    expect(blob).not.toMatch(/Reflector|transmission|Vignette|ssgi|pathtracer|jsdelivr|FloorBadges|FogExp2|howler/i)

    const untouched = [
      '../index.css',
      '../alarms/alarm.css',
      '../viewmarks/viewmark.css',
      '../viewmarks/fullscreen.ts',
      '../viewmarks/ViewmarkDock.tsx',
      '../components/scene/CameraRig.tsx',
      '../scene/stage/FloorStageCamera.tsx',
      '../scene/stage/cameraTransition.ts',
      '../components/UIShell.tsx',
      '../components/Stage.tsx',
    ]
    for (const file of untouched) {
      expect(read(file), file).not.toMatch(/visualViewport|mountVisualViewportHud|--vv-w|data-vv/)
    }

    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies['@react-three/fiber']).toBe('9.8.1')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies['@react-three/postprocessing']).toBe('3.1.3')
    expect(pkg.dependencies.postprocessing).toBe('6.39.5')
    expect(Object.keys(pkg.dependencies)).not.toContain('leva')
  })
})
