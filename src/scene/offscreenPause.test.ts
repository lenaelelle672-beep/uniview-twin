import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { canvasContainer, canvasOffscreen, observerRoots, resetCanvasOffscreen, watchCanvasOffscreen } from './offscreenPause'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

type FakeEntry = { isIntersecting: boolean }

class FakeObserver {
  static made: FakeObserver[] = []
  static reject = new Set<Element | Document | null>()
  static boomObserve = false

  readonly opts: IntersectionObserverInit
  readonly callback: IntersectionObserverCallback
  observed: Element | null = null
  disconnected = false

  constructor(callback: IntersectionObserverCallback, opts: IntersectionObserverInit) {
    if (FakeObserver.reject.has(opts.root ?? null)) throw new TypeError('root')
    this.callback = callback
    this.opts = opts
    FakeObserver.made.push(this)
  }

  observe(target: Element) {
    this.observed = target
    if (FakeObserver.boomObserve) throw new Error('observe')
  }

  disconnect() {
    this.disconnected = true
  }

  emit(isIntersecting: boolean) {
    this.callback([{ isIntersecting } as FakeEntry] as unknown as IntersectionObserverEntry[], this as unknown as IntersectionObserver)
  }
}

function targetIn(doc: object, extra: Record<string, unknown> = {}): Element {
  return { ownerDocument: doc, ...extra } as unknown as Element
}

afterEach(() => {
  resetCanvasOffscreen()
  FakeObserver.made = []
  FakeObserver.reject = new Set()
  FakeObserver.boomObserve = false
  vi.unstubAllGlobals()
})

describe('T067 视口根', () => {
  it('顶层页面只用隐式视口', () => {
    const doc = { defaultView: { frameElement: null } }
    expect(observerRoots(targetIn(doc))).toEqual([null])
  })

  it('跨文档 iframe 不把父 frameElement 当 root，失败时再试本文档', () => {
    const parent = {}
    const frame = { ownerDocument: parent, contains: () => true }
    const doc = { defaultView: { frameElement: frame } }
    const target = targetIn(doc)
    expect(observerRoots(target)).toEqual([null, doc])
  })

  it('跨源读 frameElement 抛错时同样退回本文档', () => {
    const doc = {
      defaultView: {
        get frameElement(): Element | null {
          throw new Error('SecurityError')
        },
      },
    }
    expect(observerRoots(targetIn(doc))).toEqual([null, doc])
  })

  it('同一文档里包住目标的 frame 优先，其后才是视口和文档', () => {
    const doc: { defaultView?: { frameElement: Element } } = {}
    const target = targetIn(doc)
    const frame = {
      ownerDocument: doc,
      contains: (node: Element) => node === target,
    } as unknown as Element
    doc.defaultView = { frameElement: frame }
    expect(observerRoots(target)).toEqual([frame, null, doc])
  })

  it('观察的是 scene-root，没有容器就观察 canvas', () => {
    const root = { id: 'root' } as unknown as Element
    const canvas = { closest: (sel: string) => (sel === '.scene-root' ? root : null) } as unknown as Element
    expect(canvasContainer(canvas)).toBe(root)
    const bare = { closest: () => null } as unknown as Element
    expect(canvasContainer(bare)).toBe(bare)
  })
})

describe('T067 离开视口', () => {
  it('不交叉就暂停，回到视口再恢复，重复通知不重复回调', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    const doc = { defaultView: { frameElement: null } }
    const target = targetIn(doc)
    const onPause = vi.fn(() => {
      expect(canvasOffscreen()).toBe(true)
    })
    const onResume = vi.fn(() => {
      expect(canvasOffscreen()).toBe(false)
    })
    const stop = watchCanvasOffscreen(target, { onPause, onResume })
    const io = FakeObserver.made[0]
    expect(io.opts).toMatchObject({ root: null, threshold: 0 })
    expect(io.observed).toBe(target)

    io.emit(true)
    expect(onResume).not.toHaveBeenCalled()
    io.emit(false)
    io.emit(false)
    expect(onPause).toHaveBeenCalledTimes(1)
    io.emit(true)
    io.emit(true)
    expect(onResume).toHaveBeenCalledTimes(1)

    stop()
    expect(io.disconnected).toBe(true)
    expect(canvasOffscreen()).toBe(false)
    io.emit(false)
    expect(onPause).toHaveBeenCalledTimes(1)
  })

  it('隐式视口构造成功就不再改用 iframe 文档', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    const parent = {}
    const frame = { ownerDocument: parent, contains: () => false }
    const doc = { defaultView: { frameElement: frame } }
    watchCanvasOffscreen(targetIn(doc), { onPause() {}, onResume() {} })
    expect(FakeObserver.made).toHaveLength(1)
    expect(FakeObserver.made[0].opts.root).toBeNull()
  })

  it('null 被拒绝时改用本 iframe 文档', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    FakeObserver.reject.add(null)
    const parent = {}
    const frame = { ownerDocument: parent, contains: () => false }
    const doc = { defaultView: { frameElement: frame } }
    watchCanvasOffscreen(targetIn(doc), { onPause() {}, onResume() {} })
    expect(FakeObserver.made).toHaveLength(1)
    expect(FakeObserver.made[0].opts.root).toBe(doc)
  })

  it('observe 抛错时不把泵留在离屏', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver)
    FakeObserver.boomObserve = true
    const stop = watchCanvasOffscreen(targetIn({ defaultView: { frameElement: null } }), {
      onPause() {},
      onResume() {},
    })
    expect(canvasOffscreen()).toBe(false)
    expect(FakeObserver.made[0].disconnected).toBe(true)
    stop()
  })

  it('没有 IntersectionObserver 时不抛，也不把泵标成离屏', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const stop = watchCanvasOffscreen(targetIn({}), { onPause() {}, onResume() {} })
    expect(canvasOffscreen()).toBe(false)
    stop()
  })
})

describe('T067 接线', () => {
  const eager = [
    '../components/Scene.tsx',
    '../components/Stage.tsx',
    '../App.tsx',
    '../main.tsx',
    '../components/scene/postfx/balancedFx.tsx',
    './fog.ts',
  ]

  it('DemandLoop 保留 visibilitychange，离屏观察只补在懒循环上', () => {
    const loop = read('../components/scene/DemandLoop.tsx')
    const hook = read('../components/scene/useOffscreenPause.ts')
    const pause = read('./offscreenPause.ts')

    expect(loop).toMatch(/document\.addEventListener\('visibilitychange', onVis\)/)
    expect(loop).toMatch(/document\.removeEventListener\('visibilitychange', onVis\)/)
    expect(loop).toMatch(/document\.visibilityState === 'hidden'/)
    expect(loop).toMatch(/useOffscreenPause\(gl\.domElement/)
    expect(loop).toMatch(/function pumpPaused\(\)/)
    expect(loop).toMatch(/canvasOffscreen\(\)/)
    expect(loop).toMatch(/releaseDemandWake/)
    expect(loop).toMatch(/soonestWakeMs\(last\.current, q, now, false, v\)/)
    expect(loop).toMatch(/holdRef\.current\(\)/)
    expect(loop).toMatch(/releaseRef\.current\(\)/)
    expect(loop).not.toMatch(/from ['"][^'"]*(balancedFx|postfx|FogExp2)/)
    expect(hook).toMatch(/watchCanvasOffscreen\(canvasContainer\(canvas\)/)
    expect(hook).toMatch(/pauseRef\.current = onPause/)
    expect(hook).not.toMatch(/IntersectionObserver|from 'three'|balancedFx|FogExp2|postfx/)
    expect(pause).toMatch(/new Observer\(onEntries, \{ root, threshold: 0 \}\)/)
    expect(pause).toMatch(/closest\('\.scene-root'\)/)
    expect(pause).not.toMatch(/from ['"]|balancedFx|FogExp2|postfx/)

    for (const file of eager) {
      expect(read(file)).not.toMatch(/offscreenPause|useOffscreenPause|IntersectionObserver/)
    }
  })
})
