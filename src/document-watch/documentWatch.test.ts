import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DOCUMENT_WATCH_SOURCE_BLOCK } from '../../scripts/documentWatchPlugin'
import { PIP_SOURCE_BLOCK } from '../../scripts/pipPlugin'
import { FOG_DENSITY } from '../scene/fog'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { pipDisabled, pipOffFromSearch } from '../pip/policy'
import { mountDocumentWatch } from './mount'
import { buildWatchModel, paintDocumentWatch, type WatchDocument, type WatchModel, type WatchNode, type WatchRow } from './panel'
import {
  DOCUMENT_WATCH_HEIGHT,
  DOCUMENT_WATCH_WIDTH,
  canvasMoved,
  documentHasPicture,
  documentWatchApiAvailable,
  documentWatchButton,
  documentWatchDisabled,
  documentWatchOffFromSearch,
  mayRequestDocumentWindow,
  restoreCanvas,
  type CanvasSeat,
} from './policy'
import {
  createDocumentWatchController,
  type DocumentWatchController,
  type DocumentWatchPorts,
  type DocumentWatchWindow,
} from './session'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

interface FakeNode extends WatchNode {
  tag: string
  attrs: Record<string, string>
  children: FakeNode[]
  listeners: Record<string, Array<() => void>>
}

interface FakeDoc extends WatchDocument {
  created: FakeNode[]
  head: FakeNode
  body: FakeNode
  createElement: (tag: string) => FakeNode
  querySelector: (selector: string) => unknown
}

function makeNode(tag: string, created: FakeNode[]): FakeNode {
  const node: FakeNode = {
    tag,
    textContent: '',
    attrs: {},
    children: [],
    listeners: {},
    setAttribute(name, value) {
      this.attrs[name] = value
    },
    addEventListener(type, listener) {
      this.listeners[type] ??= []
      this.listeners[type].push(listener)
    },
    append(...nodes) {
      this.children.push(...(nodes as FakeNode[]))
    },
    replaceChildren(...nodes) {
      this.children = [...(nodes as FakeNode[])]
    },
  }
  created.push(node)
  return node
}

function fakeDocument(): FakeDoc {
  const created: FakeNode[] = []
  const doc = {
    title: '',
    created,
    head: makeNode('head', created),
    body: makeNode('body', created),
    createElement: (tag: string) => makeNode(tag, created),
    querySelector(selector: string) {
      if (!selector.includes('canvas') && !selector.includes('video')) return null
      return created.find((node) => node.tag === 'canvas' || node.tag === 'video') ?? null
    },
  }
  return doc
}

function walk(node: FakeNode, visit: (node: FakeNode) => void): void {
  visit(node)
  for (const child of node.children) walk(child, visit)
}

function findAttr(doc: FakeDoc, name: string): FakeNode | undefined {
  let found: FakeNode | undefined
  walk(doc.body, (node) => {
    if (name in node.attrs) found = node
  })
  return found
}

function textsOf(doc: FakeDoc): string[] {
  const texts: string[] = []
  walk(doc.body, (node) => {
    if (node.textContent) texts.push(node.textContent)
  })
  return texts
}

interface FakeWin extends DocumentWatchWindow {
  closes: () => number
  fire: () => void
  listening: () => boolean
}

function fakeWindow(doc: WatchDocument): FakeWin {
  let onHide: (() => void) | null = null
  let closes = 0
  return {
    document: doc,
    closes: () => closes,
    close() {
      closes += 1
    },
    addEventListener(_type, listener) {
      onHide = listener
    },
    removeEventListener(_type, listener) {
      if (onHide === listener) onHide = null
    },
    fire() {
      onHide?.()
    },
    listening: () => onHide != null,
  }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (reason?: unknown) => void = () => {}
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function harness(alarms: WatchRow[] = [
  { id: 'a1', floorId: 'F1', floorName: '一层', deviceId: 'F1-2-PC', message: 'F1-2-PC 告警', focused: true },
]) {
  const doc = fakeDocument()
  const win = fakeWindow(doc)
  const gate = deferred<FakeWin | null>()
  const calls: unknown[] = []
  const phases: string[] = []
  const focused: WatchRow[] = []
  let focus = 0
  let paints = 0
  const listeners: Array<() => void> = []
  const opener = { kind: 'opener' }
  const scene = {
    kids: [] as unknown[],
    append(node: unknown) {
      this.kids.push(node)
    },
  }
  const canvas = { kind: 'canvas' }
  let parent: CanvasSeat['parent'] = scene
  const state = {
    alarms,
    floors: [{ id: 'F1', name: '一层' }],
    focusedDeviceId: 'F1-2-PC' as string | null,
  }
  const controller = createDocumentWatchController()
  const ports: DocumentWatchPorts = {
    disabled: false,
    supported: true,
    gesture: true,
    openerDocument: opener,
    requestWindow(options) {
      calls.push(options)
      return gate.promise
    },
    readState: () => state,
    subscribe(listener) {
      listeners.push(listener)
      return () => {
        const index = listeners.indexOf(listener)
        if (index >= 0) listeners.splice(index, 1)
      }
    },
    paint(target, model, actions) {
      paints += 1
      paintDocumentWatch(target, model, actions)
    },
    focusOpener() {
      focus += 1
    },
    focusAlarm(row) {
      focused.push(row)
    },
    canvasHome: () => ({ node: canvas, parent }),
    onPhase(phase) {
      phases.push(phase)
    },
  }
  return {
    doc,
    win,
    gate,
    calls,
    phases,
    focused,
    opener,
    scene,
    canvas,
    state,
    controller,
    ports,
    listeners,
    paints: () => paints,
    focusCount: () => focus,
    moveCanvas() {
      parent = { append() {} }
    },
  }
}

async function openWatch(box: ReturnType<typeof harness>, controller: DocumentWatchController = box.controller) {
  expect(controller.enter(box.ports)).toBe('idle')
  box.gate.resolve(box.win)
  await flush()
}

describe('文档值守开关', () => {
  it('只有 docpip=0 关掉，视频值守的参数互不影响', () => {
    expect(documentWatchOffFromSearch('?docpip=0')).toBe(true)
    expect(documentWatchOffFromSearch('?docpip=1')).toBe(false)
    expect(documentWatchOffFromSearch('?nopip=1')).toBe(false)
    expect(documentWatchOffFromSearch('')).toBe(false)
    expect(documentWatchDisabled('?docpip=0', null)).toBe(true)
    expect(documentWatchDisabled('', 'https://park.example/?docpip=0')).toBe(true)
    expect(documentWatchDisabled('?q=balanced', 'https://park.example/?q=balanced')).toBe(false)
    expect(documentWatchDisabled('?nopip=1', null)).toBe(false)
    expect(pipOffFromSearch('?docpip=0')).toBe(false)
    expect(pipDisabled('?docpip=0', null)).toBe(false)
    expect(pipOffFromSearch('?nopip=1')).toBe(true)
  })

  it('没有 requestWindow 就降级，视频元素上的接口不算', () => {
    expect(documentWatchApiAvailable(null)).toBe(false)
    expect(documentWatchApiAvailable({})).toBe(false)
    expect(documentWatchApiAvailable({ documentPictureInPicture: {} })).toBe(false)
    expect(documentWatchApiAvailable({ documentPictureInPicture: { requestWindow: () => Promise.resolve() } })).toBe(true)
    expect(
      documentWatchApiAvailable({
        pictureInPictureEnabled: true,
        requestPictureInPicture: () => Promise.resolve(),
      } as never),
    ).toBe(false)
  })

  it('没有手势不开；开着再给手势才关', () => {
    expect(mayRequestDocumentWindow({ disabled: false, supported: true, gesture: false, phase: 'idle', pending: false })).toBe('skip')
    expect(mayRequestDocumentWindow({ disabled: true, supported: true, gesture: true, phase: 'idle', pending: false })).toBe('skip')
    expect(mayRequestDocumentWindow({ disabled: false, supported: false, gesture: true, phase: 'idle', pending: false })).toBe('skip')
    expect(mayRequestDocumentWindow({ disabled: false, supported: true, gesture: true, phase: 'idle', pending: true })).toBe('skip')
    expect(mayRequestDocumentWindow({ disabled: false, supported: true, gesture: true, phase: 'idle', pending: false })).toBe('open')
    expect(mayRequestDocumentWindow({ disabled: false, supported: true, gesture: true, phase: 'open', pending: false })).toBe('close')
    expect(mayRequestDocumentWindow({ disabled: false, supported: true, gesture: false, phase: 'open', pending: false })).toBe('skip')
  })

  it('按钮文案和视频值守分开', () => {
    expect(documentWatchButton({ phase: 'idle', disabled: false, supported: true })).toMatchObject({
      text: '文档值守',
      pressed: 'false',
      disabled: false,
    })
    expect(documentWatchButton({ phase: 'open', disabled: false, supported: true }).text).toBe('回到主页')
    expect(documentWatchButton({ phase: 'idle', disabled: true, supported: true }).disabled).toBe(true)
    expect(documentWatchButton({ phase: 'idle', disabled: false, supported: false }).title).toBe('当前浏览器没有文档画中画')
    for (const view of [
      documentWatchButton({ phase: 'idle', disabled: false, supported: true }),
      documentWatchButton({ phase: 'open', disabled: false, supported: true }),
      documentWatchButton({ phase: 'idle', disabled: true, supported: false }),
    ]) {
      expect(view.text).not.toBe('画中画')
      expect(view.text).not.toBe('退出画中画')
    }
  })
})

describe('告警小窗', () => {
  it('焦点卡和列表只留楼层与告警，多出来的收成另 N 条', () => {
    const alarms = Array.from({ length: 7 }, (_, index) => ({
      id: `a${index}`,
      floorId: 'F1',
      deviceId: `D${index}`,
      message: index === 6 ? '  末条告警  ' : `告警${index}`,
    }))
    const model = buildWatchModel({
      alarms,
      floors: [{ id: 'F1', name: '一层' }],
      focusedDeviceId: 'D6',
    })
    expect(model.total).toBe(7)
    expect(model.rows).toHaveLength(6)
    expect(model.extra).toBe(1)
    expect(model.card).toMatchObject({ floorName: '一层', message: '末条告警', focused: true })
    expect(model.rows.some((row) => row.focused)).toBe(false)

    const named = buildWatchModel({
      alarms: [{ id: 'a', floorId: 'F1', deviceId: 'F1-2-PC', message: 'F1-2-PC 告警' }],
      floors: [{ id: 'F1', name: '一层' }],
      focusedDeviceId: 'F1-2-PC',
    })
    expect(named.card).toMatchObject({ floorName: '一层', message: 'F1-2-PC 告警', focused: true })
    expect(buildWatchModel(null)).toEqual({ card: null, rows: [], extra: 0, total: 0 })
    expect(buildWatchModel({ alarms: 'nope' } as never).total).toBe(0)
    expect(buildWatchModel({ alarms: [{ id: 'x', message: '缺楼层' }] }).total).toBe(0)
    expect(buildWatchModel({ alarms: [{ id: 'x', floorId: 'F2', deviceId: 'cam' }] }).rows[0].message).toBe('cam')
  })

  it('小窗 DOM 只有告警节点，回到主页和焦点分开', () => {
    const doc = fakeDocument()
    const focused: WatchRow[] = []
    let backs = 0
    const model: WatchModel = buildWatchModel({
      alarms: [{ id: 'a1', floorId: 'F1', deviceId: 'F1-2-PC', message: 'F1-2-PC 告警' }],
      floors: [{ id: 'F1', name: '一层' }],
      focusedDeviceId: null,
    })
    paintDocumentWatch(doc, model, {
      onBack: () => {
        backs += 1
      },
      onFocus: (row) => {
        focused.push(row)
      },
    })
    expect(doc.title).toBe('文档值守')
    expect(doc.created.map((node) => node.tag)).not.toEqual(expect.arrayContaining(['canvas', 'video', 'iframe', 'script']))
    expect(documentHasPicture(doc)).toBe(false)
    expect(textsOf(doc)).toContain('一层 F1-2-PC 告警')
    expect(textsOf(doc)).toContain('主视图没有焦点')
    findAttr(doc, 'data-alarm')?.listeners.click?.[0]?.()
    expect(focused).toHaveLength(1)
    expect(backs).toBe(0)
    findAttr(doc, 'data-back')?.listeners.click?.[0]?.()
    expect(backs).toBe(1)
    paintDocumentWatch(doc, model, { onBack() {}, onFocus() {} })
    expect(doc.head.children.filter((node) => node.tag === 'style')).toHaveLength(1)
  })
})

describe('手势、降级、回到主页', () => {
  it('没有手势不调用 requestWindow', async () => {
    const box = harness()
    box.ports.gesture = false
    expect(box.controller.enter(box.ports)).toBe('idle')
    await flush()
    expect(box.calls).toEqual([])
    expect(box.controller.phase()).toBe('idle')
    expect(box.focusCount()).toBe(0)
    expect(box.win.closes()).toBe(0)
  })

  it('没有接口时静默停在空闲', async () => {
    const box = harness()
    box.ports.supported = false
    const errors: unknown[] = []
    const orig = console.error
    console.error = (...args: unknown[]) => {
      errors.push(args)
    }
    try {
      expect(() => box.controller.enter(box.ports)).not.toThrow()
      await flush()
    } finally {
      console.error = orig
    }
    expect(errors).toEqual([])
    expect(box.calls).toEqual([])
    expect(box.controller.phase()).toBe('idle')
    expect(box.paints()).toBe(0)
  })

  it('关掉或请求失败也不抛', async () => {
    const blocked = harness()
    blocked.ports.disabled = true
    expect(blocked.controller.enter(blocked.ports)).toBe('idle')
    expect(blocked.calls).toEqual([])

    const rejected = harness()
    expect(rejected.controller.enter(rejected.ports)).toBe('idle')
    rejected.gate.reject(new Error('denied'))
    await flush()
    expect(rejected.controller.phase()).toBe('idle')
    expect(rejected.focusCount()).toBe(0)
    expect(rejected.win.closes()).toBe(0)

    const thrown = harness()
    thrown.ports.requestWindow = () => {
      throw new Error('blocked')
    }
    expect(() => thrown.controller.enter(thrown.ports)).not.toThrow()
    expect(thrown.controller.phase()).toBe('idle')
  })

  it('手势里同步打开，参数允许回到打开它的页面', async () => {
    const box = harness()
    const seen = box.controller.enter(box.ports)
    expect(seen).toBe('idle')
    expect(box.calls).toEqual([
      { width: DOCUMENT_WATCH_WIDTH, height: DOCUMENT_WATCH_HEIGHT, disallowReturnToOpener: false },
    ])
    expect(DOCUMENT_WATCH_WIDTH).toBe(320)
    expect(DOCUMENT_WATCH_HEIGHT).toBe(420)
    box.ports.gesture = true
    expect(box.controller.enter(box.ports)).toBe('idle')
    expect(box.calls).toHaveLength(1)
    box.gate.resolve(box.win)
    await flush()
    expect(box.controller.phase()).toBe('open')
    expect(box.phases).toContain('open')
    expect(textsOf(box.doc)).toContain('当前焦点 一层 F1-2-PC 告警')
    expect(box.doc.created.some((node) => node.tag === 'canvas' || node.tag === 'video')).toBe(false)
    expect(box.scene.kids).toEqual([])
  })

  it('再点一次、小窗 pagehide、或回到主页按钮，都会关窗并交回主页面', async () => {
    const toggled = harness()
    await openWatch(toggled)
    expect(toggled.controller.enter(toggled.ports)).toBe('idle')
    expect(toggled.controller.phase()).toBe('idle')
    expect(toggled.win.closes()).toBe(1)
    expect(toggled.focusCount()).toBe(1)
    expect(toggled.win.listening()).toBe(false)

    const hidden = harness()
    await openWatch(hidden)
    expect(hidden.win.listening()).toBe(true)
    hidden.win.fire()
    expect(hidden.controller.phase()).toBe('idle')
    expect(hidden.focusCount()).toBe(1)
    expect(hidden.win.closes()).toBe(1)

    const backed = harness()
    await openWatch(backed)
    findAttr(backed.doc, 'data-back')?.listeners.click?.[0]?.()
    expect(backed.controller.phase()).toBe('idle')
    expect(backed.focusCount()).toBe(1)
    expect(backed.win.closes()).toBe(1)

    const idle = harness()
    idle.controller.exit(idle.ports)
    expect(idle.focusCount()).toBe(0)
    expect(idle.win.closes()).toBe(0)
  })

  it('点一条告警只聚焦，不关小窗', async () => {
    const box = harness()
    await openWatch(box)
    findAttr(box.doc, 'data-alarm')?.listeners.click?.[0]?.()
    expect(box.focused).toHaveLength(1)
    expect(box.focused[0]?.deviceId).toBe('F1-2-PC')
    expect(box.controller.phase()).toBe('open')
    expect(box.win.closes()).toBe(0)
    expect(box.focusCount()).toBe(0)
    box.state.alarms = [
      ...box.state.alarms,
      { id: 'a2', floorId: 'F2', floorName: '2 层', deviceId: 'F2-CAM1', message: 'F2-CAM1 告警', focused: false },
    ]
    box.state.floors = [
      { id: 'F1', name: '一层' },
      { id: 'F2', name: '2 层' },
    ]
    box.listeners[0]?.()
    expect(box.paints()).toBe(2)
    expect(textsOf(box.doc)).toContain('2 层 F2-CAM1 告警')
    expect(box.controller.phase()).toBe('open')
  })

  it('没有手势时，已经开着的小窗保持不动', async () => {
    const box = harness()
    await openWatch(box)
    box.ports.gesture = false
    expect(box.controller.enter(box.ports)).toBe('open')
    expect(box.controller.phase()).toBe('open')
    expect(box.win.closes()).toBe(0)
    expect(box.focusCount()).toBe(0)
  })

  it('画面被搬走时放回主页面并关掉小窗', async () => {
    const box = harness()
    box.ports.paint = () => {
      box.moveCanvas()
    }
    box.controller.enter(box.ports)
    box.gate.resolve(box.win)
    await flush()
    expect(box.scene.kids).toContain(box.canvas)
    expect(box.controller.phase()).toBe('idle')
    expect(box.win.closes()).toBe(1)
    expect(box.focusCount()).toBe(1)
    expect(canvasMoved({ node: box.canvas, parent: box.scene }, { node: box.canvas, parent: box.scene })).toBe(false)
    const seat = { node: box.canvas, parent: { append() {} } }
    restoreCanvas(seat)
  })

  it('小窗里出现画面节点，或文档就是主页面时，不留在小窗', async () => {
    const pictured = harness()
    pictured.ports.paint = (doc, model, actions) => {
      paintDocumentWatch(doc, model, actions)
      doc.createElement('canvas')
    }
    pictured.controller.enter(pictured.ports)
    pictured.gate.resolve(pictured.win)
    await flush()
    expect(pictured.controller.phase()).toBe('idle')
    expect(pictured.focusCount()).toBe(1)
    expect(documentHasPicture(pictured.doc)).toBe(true)

    const same = harness()
    const openerDoc = fakeDocument()
    const openerWin = fakeWindow(openerDoc)
    same.ports.openerDocument = openerDoc
    let painted = 0
    same.ports.paint = () => {
      painted += 1
    }
    same.controller.enter(same.ports)
    same.gate.resolve(openerWin)
    await flush()
    expect(painted).toBe(0)
    expect(same.controller.phase()).toBe('idle')
    expect(openerWin.closes()).toBe(1)
    expect(same.focusCount()).toBe(0)
    expect(documentHasPicture(null)).toBe(true)
  })

  it('取消尚未打开的请求后，迟到的小窗会被关掉', async () => {
    const box = harness()
    box.controller.enter(box.ports)
    box.controller.exit(box.ports)
    box.gate.resolve(box.win)
    await flush()
    expect(box.win.closes()).toBe(1)
    expect(box.focusCount()).toBe(0)
    expect(box.controller.phase()).toBe('idle')
    expect(box.paints()).toBe(0)
  })
})

describe('文档值守分包不进首屏，也不碰视频值守', () => {
  it('懒挂在 dock 哈希之后，和视频值守、多标签、雾、T032 划界', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(read('../scene/stage/cameraTransition.ts')).toMatch(/USER_CAMERA_SMOOTH_TIME = 0\.42/)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)

    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const session = read('./session.ts')
    const policy = read('./policy.ts')
    const panel = read('./panel.ts')
    const plugin = read('../../scripts/documentWatchPlugin.ts')
    const vite = read('../../vite.config.ts')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }

    expect(dock).toContain(DOCUMENT_WATCH_SOURCE_BLOCK)
    expect(dock).toContain(PIP_SOURCE_BLOCK)
    expect(dock).toMatch(/import\('\.\.\/document-watch\/mount'\)/)
    expect(dock).toMatch(/mountDocumentWatch\(\)/)
    expect(dock).not.toMatch(/from '\.\.\/document-watch\/mount'/)
    const stripped = dock.replace(DOCUMENT_WATCH_SOURCE_BLOCK, '')
    expect(stripped).not.toMatch(/mountDocumentWatch|document-watch\/mount|docpip|DocumentWatch/)
    expect(stripped).toMatch(/mountBroadcastBus\(\(\) => import\('\.\.\/components\/scene\/vp'\)\)/)
    expect(plugin).toContain(DOCUMENT_WATCH_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'document-watch-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/DocumentWatch\.js/)
    expect(plugin).toMatch(/__twinDocumentWatchStore/)
    expect(plugin).toMatch(/assets\/PipWatch\.js/)
    expect(vite).toMatch(/documentWatchAfterHash/)

    expect(mount).toMatch(/addEventListener\('click', onClick\)/)
    expect(mount).toMatch(/pagehide/)
    expect(mount).toMatch(/window\.focus\(\)/)
    expect(mount).toMatch(/from '\.\.\/store\/store'/)
    expect(mount).not.toMatch(/visibilitychange|fullscreen|captureStream|requestPictureInPicture|mountPipWatch|BroadcastChannel/)
    const enterAt = mount.indexOf('controller.enter')
    expect(enterAt).toBeGreaterThan(mount.indexOf('function onClick'))
    expect(enterAt).toBeLessThan(mount.indexOf('function ensureStyle'))
    expect(mount.match(/controller\.enter/g)).toEqual(['controller.enter'])

    expect(session).toMatch(/disallowReturnToOpener: false/)
    expect(session).toMatch(/requestWindow\(/)
    expect(session).toMatch(/focusOpener\(/)
    expect(session).not.toMatch(/captureStream|requestPictureInPicture|setFrameloop|console\./)
    expect(policy).toMatch(/docpip/)
    expect(policy).not.toMatch(/nopip|requestPictureInPicture|captureStream|console\./)
    expect(panel).not.toMatch(/createElement\('canvas'|createElement\('video'|createElement\('script'|innerHTML|captureStream|console\./)

    const blob = [mount, session, policy, panel].join('\n')
    expect(blob).not.toMatch(/from ['"][^'"]*(pip\/|bus\/|fog|cameraTransition|balancedFx|three'|zustand|postprocessing)/)
    expect(blob).not.toMatch(/BroadcastChannel|mountPipWatch|PipWatch|nopip|captureStream|requestPictureInPicture|FogExp2/)

    for (const file of ['../pip/mount.ts', '../pip/policy.ts', '../pip/session.ts', '../../scripts/pipPlugin.ts']) {
      expect(read(file), file).not.toMatch(/documentPictureInPicture|mountDocumentWatch|docpip|DocumentWatch/)
    }
    for (const file of ['../bus/mount.ts', '../bus/policy.ts', '../bus/runtime.ts']) {
      expect(read(file), file).not.toMatch(/documentPictureInPicture|mountDocumentWatch|docpip|DocumentWatch/)
    }

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../index.css',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../scene/stage/prefetchLazyChunks.ts',
      '../scene/fog.ts',
      '../scene/stage/cameraTransition.ts',
      '../viewmarks/fullscreen.ts',
      '../viewmarks/ViewmarkDock.tsx',
      '../viewmarks/shareShot.ts',
      '../capture/clipSession.ts',
    ]
    for (const file of eager) {
      expect(read(file), file).not.toMatch(/mountDocumentWatch|documentPictureInPicture|DocumentWatch|docpip/)
    }

    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(Object.keys(pkg.dependencies).sort()).toEqual(
      [
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
      ].sort(),
    )
    expect(mountDocumentWatch).toBeTypeOf('function')
    expect(() => mountDocumentWatch()).not.toThrow()
  })
})
