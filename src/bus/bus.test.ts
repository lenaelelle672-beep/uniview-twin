import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BUS_SOURCE_BLOCK } from '../../scripts/broadcastPlugin'
import { FOG_DENSITY } from '../scene/fog'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { resetTwinStore, useTwinStore } from '../store/store'
import { closeBroadcastBus, mountBroadcastBus, resetBroadcastBusForTests, setBroadcastBus } from './mount'
import {
  BUS_CHANNEL,
  LAYER_KEYS,
  acceptViewpointToken,
  alarmIdFor,
  busWanted,
  initialBusWanted,
  diffWhitelist,
  parseWire,
  projectBusState,
  rememberId,
  type BusBody,
  type BusSnapshot,
} from './policy'
import { startBus, type BusChannel, type BusPorts } from './runtime'

const TOKEN = '1~2~3~4~5~6~40'
const SHARE = `?vp=${TOKEN}`

function layers(on: Partial<BusSnapshot['layers']> = {}): BusSnapshot['layers'] {
  const next = {} as BusSnapshot['layers']
  for (const key of LAYER_KEYS) next[key] = on[key] === true
  return next
}

function snap(patch: Partial<BusSnapshot> = {}): BusSnapshot {
  return {
    focusSeq: 0,
    vpSeq: 0,
    floor: null,
    deskId: null,
    deviceId: null,
    vp: null,
    view: 'building',
    cam: null,
    alarmId: null,
    ...patch,
    layers: patch.layers ?? layers(),
  }
}

function wire(from: string, id: string, body: BusBody) {
  return { v: 1 as const, id, from, ...body }
}

class Hub {
  echo = false
  ports: Array<{ name: string; onmessage: BusChannel['onmessage']; closed: boolean }> = []

  open(name: string): BusChannel {
    const self = { name, onmessage: null as BusChannel['onmessage'], closed: false }
    this.ports.push(self)
    return {
      postMessage: (data) => {
        for (const other of this.ports) {
          if (other.closed || other.name !== name || !other.onmessage) continue
          if (other === self && !this.echo) continue
          other.onmessage({ data })
        }
      },
      get onmessage() {
        return self.onmessage
      },
      set onmessage(next) {
        self.onmessage = next
      },
      close() {
        self.closed = true
        self.onmessage = null
      },
    }
  }
}

function memory(initial: BusSnapshot) {
  let current = initial
  const listeners = new Set<() => void>()
  return {
    read: () => current,
    update(patch: Partial<BusSnapshot>) {
      current = { ...current, ...patch, layers: patch.layers ?? current.layers }
      for (const listener of listeners) listener()
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

function applyPeer(store: ReturnType<typeof memory>, body: BusBody): void {
  const prev = store.read()
  if (body.t === 'focus') {
    store.update({
      focusSeq: prev.focusSeq + 1,
      floor: body.floor,
      deskId: body.deskId,
      deviceId: body.deviceId,
      view: 'floor',
      vp: null,
      alarmId: null,
    })
    return
  }
  if (body.t === 'alarmId') {
    store.update({
      focusSeq: prev.focusSeq + 1,
      floor: body.floor,
      deskId: body.deskId,
      deviceId: body.deviceId,
      view: 'floor',
      vp: null,
      alarmId: body.alarmId,
    })
    return
  }
  if (body.t === 'vp') {
    store.update({
      vpSeq: prev.vpSeq + 1,
      vp: body.token,
      view: body.view,
      floor: body.floor,
      cam: body.cam,
      deskId: body.pos,
      deviceId: body.pos === prev.deskId ? prev.deviceId : null,
    })
    return
  }
  store.update({ layers: { ...prev.layers, [body.key]: body.on } })
}

function pair(hub = new Hub()) {
  const leftStore = memory(snap())
  const rightStore = memory(snap())
  const loads: string[] = []
  const ports = (tabId: string, store: ReturnType<typeof memory>, trackLoad = false): BusPorts => ({
    tabId,
    enabled: true,
    openChannel: (name) => hub.open(name),
    read: store.read,
    apply: (body) => applyPeer(store, body),
    subscribe: store.subscribe,
    loadViewpoint: trackLoad
      ? () => {
          loads.push(tabId)
        }
      : undefined,
    now: () => 1_000,
  })
  const left = startBus(ports('ta', leftStore))
  const right = startBus(ports('tb', rightStore, true))
  return { hub, left, right, leftStore, rightStore, loads }
}

describe('T081 白名单', () => {
  it('默认开，?bus=0 关掉，令牌不接受分享链接', () => {
    expect(busWanted('')).toBe(true)
    expect(busWanted('?q=balanced')).toBe(true)
    expect(busWanted('?bus=1')).toBe(true)
    expect(busWanted('?bus=0')).toBe(false)
    expect(busWanted('?q=balanced&bus=0')).toBe(false)
    expect(initialBusWanted('?q=balanced', 'http://127.0.0.1:5190/?q=balanced&bus=0')).toBe(false)
    expect(initialBusWanted('?q=balanced', 'http://127.0.0.1:5190/?q=balanced')).toBe(true)
    expect(initialBusWanted('?bus=0', null)).toBe(false)
    expect(initialBusWanted('', null)).toBe(true)
    expect(acceptViewpointToken(TOKEN)).toBe(TOKEN)
    expect(acceptViewpointToken(SHARE)).toBeNull()
    expect(acceptViewpointToken('?vp=nope')).toBeNull()
    expect(acceptViewpointToken('1~2~3~4~5~6~1')).toBeNull()
    expect(BUS_CHANNEL).toBe('uniview-twin')
  })

  it('只投影 focus、令牌、alarmId、图层', () => {
    const projected = projectBusState({
      focusSeq: 2,
      vpSeq: 1,
      floor: 'F12',
      deskId: 'F12-66',
      deviceId: 'F12-66-PC',
      vp: TOKEN,
      view: 'floor',
      cam: 'photo1',
      alarmId: 'F12-66-PC-AL',
      layers: { people: true, heat: false, debugHelpers: true },
    })
    expect(projected.floor).toBe('F12')
    expect(projected.layers.people).toBe(true)
    expect(projected.layers.heat).toBe(false)
    expect(projected.layers.wireframe).toBe(false)
    expect(Object.keys(projected.layers)).toEqual([...LAYER_KEYS])
    expect(projected).not.toHaveProperty('debugHelpers')
    expect(alarmIdFor('F12-66-PC', [{ id: 'F12-66-PC-AL', deviceId: 'F12-66-PC' }])).toBe('F12-66-PC-AL')
    expect(alarmIdFor('F12-1-PC', [{ id: 'F12-66-PC-AL', deviceId: 'F12-66-PC' }])).toBeNull()

    const base = snap()
    expect(diffWhitelist(base, base)).toEqual([])
    expect(diffWhitelist(base, { ...base, focusSeq: 1, floor: 'F3', deskId: null, deviceId: null })).toEqual([
      { t: 'focus', floor: 'F3', deskId: null, deviceId: null },
    ])
    expect(
      diffWhitelist(base, {
        ...base,
        focusSeq: 1,
        floor: 'F12',
        deskId: 'F12-66',
        deviceId: 'F12-66-PC',
        alarmId: 'F12-66-PC-AL',
      }),
    ).toEqual([
      {
        t: 'alarmId',
        alarmId: 'F12-66-PC-AL',
        floor: 'F12',
        deskId: 'F12-66',
        deviceId: 'F12-66-PC',
      },
    ])
    expect(
      diffWhitelist(base, {
        ...base,
        vpSeq: 1,
        vp: TOKEN,
        view: 'floor',
        floor: 'F8',
        cam: 'east',
        deskId: 'F8-1',
        focusSeq: 4,
      }),
    ).toEqual([{ t: 'vp', token: TOKEN, view: 'floor', floor: 'F8', cam: 'east', pos: 'F8-1' }])
    expect(diffWhitelist(base, { ...base, layers: layers({ heat: true }) })).toEqual([
      { t: 'layer', key: 'heat', on: true },
    ])
  })

  it('环回、回声和整包 store 都丢掉', () => {
    const focus = wire('tb', 'tb:1', { t: 'focus', floor: 'F12', deskId: 'F12-66', deviceId: null })
    expect(parseWire(focus, 'ta', [])?.body.t).toBe('focus')
    expect(parseWire(focus, 'tb', [])).toBeNull()
    expect(parseWire(focus, 'ta', ['tb:1'])).toBeNull()
    expect(parseWire({ ...focus, floors: [], alarms: [], searchQuery: 'x' }, 'ta', [])).toBeNull()
    expect(parseWire({ v: 1, id: 'x', from: 'tb', t: 'store', state: { view: 'floor' } }, 'ta', [])).toBeNull()
    expect(parseWire(wire('tb', 'tb:2', { t: 'vp', token: SHARE, view: 'floor', floor: 'F8', cam: null, pos: null }), 'ta', [])).toBeNull()
    expect(parseWire(wire('tb', 'tb:3', { t: 'vp', token: TOKEN, view: 'floor', floor: 'F8', cam: null, pos: null }), 'ta', [])?.body).toMatchObject({
      t: 'vp',
      token: TOKEN,
    })
    const seen = rememberId(rememberId([], 'a'), 'a')
    expect(seen).toEqual(['a'])
  })
})

describe('T081 双标签', () => {
  it('焦点、告警、令牌和图层只走一趟，对端不再转发', () => {
    const peers = pair()
    peers.leftStore.update({ focusSeq: 1, floor: 'F12', deskId: 'F12-66', deviceId: 'F12-66-PC', view: 'floor' })
    expect(peers.left.probe()).toMatchObject({ sent: 1, applied: 0, channel: BUS_CHANNEL })
    expect(peers.right.probe()).toMatchObject({ sent: 0, applied: 1 })
    expect(peers.rightStore.read()).toMatchObject({ floor: 'F12', deskId: 'F12-66', focusSeq: 1 })

    peers.leftStore.update({
      focusSeq: 2,
      floor: 'F12',
      deskId: 'F12-66',
      deviceId: 'F12-66-PC',
      alarmId: 'F12-66-PC-AL',
      view: 'floor',
    })
    expect(peers.rightStore.read().alarmId).toBe('F12-66-PC-AL')
    expect(peers.right.probe().sent).toBe(0)

    peers.leftStore.update({
      vpSeq: 1,
      vp: TOKEN,
      view: 'floor',
      floor: 'F8',
      cam: 'east',
      deskId: 'F8-1',
    })
    expect(peers.rightStore.read()).toMatchObject({ vp: TOKEN, floor: 'F8', cam: 'east', deskId: 'F8-1' })
    expect(peers.loads).toEqual(['tb'])
    expect(peers.right.probe().sent).toBe(0)

    peers.leftStore.update({ layers: layers({ plaques: true }) })
    expect(peers.rightStore.read().layers.plaques).toBe(true)
    expect(peers.left.probe().sent).toBe(4)
    expect(peers.right.probe()).toMatchObject({ sent: 0, applied: 4 })
  })

  it('自己的回声丢掉，关掉时 close，突发到顶就停', () => {
    const peers = pair()
    peers.hub.echo = true
    peers.leftStore.update({ layers: layers({ edges: true }) })
    expect(peers.left.probe()).toMatchObject({ sent: 1, applied: 0, dropped: 1 })
    expect(peers.right.probe()).toMatchObject({ sent: 0, applied: 1 })

    peers.left.setEnabled(false)
    expect(peers.left.probe()).toMatchObject({ on: false, closed: true })
    expect(peers.hub.ports[0]?.closed).toBe(true)
    peers.leftStore.update({ layers: layers({ heat: true }) })
    expect(peers.left.probe().sent).toBe(1)
    expect(peers.right.probe().applied).toBe(1)

    peers.left.setEnabled(true)
    expect(peers.left.probe().on).toBe(true)
    peers.leftStore.update({ layers: layers({ badges: true }) })
    expect(peers.rightStore.read().layers.badges).toBe(true)

    const storm = pair()
    for (let index = 0; index < 10; index += 1) {
      storm.leftStore.update({ focusSeq: index + 1, floor: 'F3', deskId: null, deviceId: null, view: 'floor' })
    }
    expect(storm.left.probe().sent).toBe(8)
    expect(storm.left.probe().dropped).toBe(2)
    expect(storm.right.probe().sent).toBe(0)
    storm.left.close()
    storm.left.close()
    expect(storm.left.probe().closed).toBe(true)
    expect(storm.right.enabled()).toBe(true)
    expect(storm.hub.ports.filter((port) => !port.closed)).toHaveLength(1)
  })
})

class FakeChannel {
  static instances: FakeChannel[] = []
  name: string
  onmessage: ((event: { data: unknown }) => void) | null = null
  closed = false

  constructor(name: string) {
    this.name = name
    FakeChannel.instances.push(this)
  }

  postMessage(_data: unknown) {}

  close() {
    this.closed = true
    this.onmessage = null
  }
}

class El {
  tag: string
  className = ''
  textContent = ''
  type = ''
  dataset: Record<string, string> = {}
  attrs: Record<string, string> = {}
  children: El[] = []
  parent: El | null = null
  listeners: Record<string, Array<() => void>> = {}

  constructor(tag: string) {
    this.tag = tag
  }

  setAttribute(key: string, value: string) {
    this.attrs[key] = value
  }

  getAttribute(key: string) {
    return this.attrs[key] ?? null
  }

  addEventListener(type: string, fn: () => void) {
    ;(this.listeners[type] ??= []).push(fn)
  }

  append(node: El) {
    node.remove()
    node.parent = this
    this.children.push(node)
  }

  insertBefore(node: El, before: El | null) {
    node.remove()
    node.parent = this
    const index = before ? this.children.indexOf(before) : -1
    if (index < 0) this.children.push(node)
    else this.children.splice(index, 0, node)
  }

  remove() {
    if (!this.parent) return
    const index = this.parent.children.indexOf(this)
    if (index >= 0) this.parent.children.splice(index, 1)
    this.parent = null
  }

  querySelector(selector: string): El | null {
    for (const child of this.children) {
      if (matches(child, selector)) return child
      const nested = child.querySelector(selector)
      if (nested) return nested
    }
    return null
  }
}

function matches(el: El, selector: string): boolean {
  if (selector === 'style[data-twin-bus]') return el.tag === 'style' && Object.prototype.hasOwnProperty.call(el.dataset, 'twinBus')
  if (selector === 'button.twin-bus-toggle') return el.tag === 'button' && el.className.split(' ').includes('twin-bus-toggle')
  if (selector === '.topbar') return el.className.split(' ').includes('topbar')
  if (selector === '.search-wrap') return el.className.split(' ').includes('search-wrap')
  return false
}

function installWindow(search = '') {
  const listeners = new Map<string, Set<() => void>>()
  const head = new El('head')
  const body = new El('body')
  const topbar = new El('header')
  topbar.className = 'topbar'
  const searchWrap = new El('div')
  searchWrap.className = 'search-wrap'
  topbar.append(searchWrap)
  body.append(topbar)
  const documentStub = {
    head,
    body,
    createElement: (tag: string) => new El(tag),
    querySelector: (selector: string) => head.querySelector(selector) ?? body.querySelector(selector),
  }
  const win = {
    location: { search },
    __vpH: false,
    __twinBus: undefined as Window['__twinBus'],
    addEventListener(type: string, fn: () => void) {
      const set = listeners.get(type) ?? new Set()
      set.add(fn)
      listeners.set(type, set)
    },
    removeEventListener(type: string, fn: () => void) {
      listeners.get(type)?.delete(fn)
    },
    hide() {
      for (const fn of listeners.get('pagehide') ?? []) fn()
    },
  }
  vi.stubGlobal('window', win)
  vi.stubGlobal('document', documentStub)
  vi.stubGlobal('BroadcastChannel', FakeChannel)
  vi.stubGlobal('MutationObserver', class {
    observe() {}
    disconnect() {}
  })
  return { win, documentStub, topbar }
}

describe('T081 挂载', () => {
  afterEach(() => {
    resetBroadcastBusForTests()
    resetTwinStore()
    FakeChannel.instances = []
    vi.unstubAllGlobals()
  })

  it('订阅白名单，环回不改状态，关掉后 close', () => {
    const { win, documentStub } = installWindow()
    const loads: string[] = []
    mountBroadcastBus(() => {
      loads.push('vp')
      return Promise.resolve()
    })
    expect(win.__twinBus).toMatchObject({ on: true, channel: BUS_CHANNEL, closed: false, sent: 0 })
    const button = documentStub.querySelector('button.twin-bus-toggle')
    expect(button?.textContent).toBe('多屏开')
    expect(button?.getAttribute('aria-pressed')).toBe('true')
    expect(button?.getAttribute('aria-label')).toBe('多屏同步')

    useTwinStore.getState().setLayer('heat', false)
    useTwinStore.setState({ searchQuery: 'abc', dayNight: 'night', exploded: true })
    const channel = FakeChannel.instances[0]
    expect(channel?.name).toBe(BUS_CHANNEL)
    expect(win.__twinBus?.sent).toBe(1)

    channel?.onmessage?.({
      data: { v: 1, id: 'tb:1', from: 'tb', t: 'focus', floor: 'F12', deskId: 'F12-66', deviceId: 'F12-66-PC' },
    })
    expect(useTwinStore.getState()).toMatchObject({
      selectedFloor: 'F12',
      focusedDeskId: 'F12-66',
      focusedDeviceId: 'F12-66-PC',
      view: 'floor',
    })
    expect(win.__twinBus).toMatchObject({ sent: 1, applied: 1 })

    channel?.onmessage?.({
      data: {
        v: 1,
        id: 'tb:2',
        from: 'tb',
        t: 'alarmId',
        alarmId: 'F12-66-PC-AL',
        floor: 'F12',
        deskId: 'F12-66',
        deviceId: 'F12-66-PC',
      },
    })
    expect(win.__twinBus?.sent).toBe(1)

    channel?.onmessage?.({
      data: { v: 1, id: 'tb:3', from: 'tb', t: 'vp', token: TOKEN, view: 'floor', floor: 'F8', cam: null, pos: 'F8-1' },
    })
    expect(useTwinStore.getState().vp).toBe(TOKEN)
    expect(loads).toEqual(['vp'])
    expect(win.__twinBus?.sent).toBe(1)

    channel?.onmessage?.({
      data: { v: 1, id: 'tb:4', from: 'tb', t: 'store', floors: [], desks: [], devices: [], people: [], alarms: [] },
    })
    expect(win.__twinBus).toMatchObject({ sent: 1, applied: 3, dropped: 1 })

    const echoed = { v: 1, id: 'echo', from: win.__twinBus?.tab, t: 'layer', key: 'edges', on: true }
    channel?.onmessage?.({ data: echoed })
    expect(useTwinStore.getState().layers.edges).toBe(false)
    expect(win.__twinBus?.applied).toBe(3)

    setBroadcastBus(false)
    expect(channel?.closed).toBe(true)
    expect(win.__twinBus).toMatchObject({ on: false, closed: true })
    expect(button?.textContent).toBe('多屏关')
    useTwinStore.getState().setLayer('labels', false)
    expect(win.__twinBus?.sent).toBe(1)

    button?.listeners.click?.[0]?.()
    expect(win.__twinBus?.on).toBe(true)
    expect(FakeChannel.instances.at(-1)?.closed).toBe(false)
    win.hide()
    expect(win.__twinBus?.closed).toBe(true)
    expect(FakeChannel.instances.at(-1)?.closed).toBe(true)
  })

  it('?bus=0 不打开频道', () => {
    installWindow('?bus=0')
    mountBroadcastBus()
    expect(FakeChannel.instances).toHaveLength(0)
    expect(window.__twinBus).toMatchObject({ on: false, closed: true })
    useTwinStore.getState().setLayer('heat', false)
    expect(FakeChannel.instances).toHaveLength(0)
    closeBroadcastBus()
    expect(() => closeBroadcastBus()).not.toThrow()
  })

  it('地址栏同步抹掉 bus=0 后仍看启动导航', () => {
    installWindow('?q=balanced')
    vi.stubGlobal('performance', {
      getEntriesByType: (type: string) =>
        type === 'navigation' ? [{ name: 'http://127.0.0.1:5190/?q=balanced&bus=0' }] : [],
    })
    mountBroadcastBus()
    expect(FakeChannel.instances).toHaveLength(0)
    expect(window.__twinBus).toMatchObject({ on: false, closed: true, sent: 0 })
    expect(document.querySelector('button.twin-bus-toggle')?.textContent).toBe('多屏关')
  })

  it('没有 window 时挂载直接返回', () => {
    expect(() => mountBroadcastBus()).not.toThrow()
  })
})

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('T081 懒挂与划界', () => {
  it('整段在 dock 哈希之后，不进首屏，不碰雾、T032、T049 分享', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)
    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const runtime = read('./runtime.ts')
    const policy = read('./policy.ts')
    const plugin = read('../../scripts/broadcastPlugin.ts')
    const vite = read('../../vite.config.ts')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }
    const blob = [mount, runtime, policy].join('\n')

    expect(dock).toContain(BUS_SOURCE_BLOCK.trimEnd())
    expect(dock.replace(BUS_SOURCE_BLOCK, '')).not.toMatch(/mountBroadcastBus|bus\/mount/)
    expect(dock).not.toMatch(/from '\.\.\/bus\/mount'/)
    expect(vite).toMatch(/broadcastAfterHash\(\)/)
    expect(plugin).toMatch(/name: 'broadcast-after-hash'/)
    expect(plugin).toMatch(/assets\/BroadcastBus\.js/)
    expect(plugin).toMatch(/BUS_SOURCE_BLOCK/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/__twinBusStore/)
    expect(mount).toMatch(/new BroadcastChannel/)
    expect(mount).toMatch(/\.close\(\)/)
    expect(runtime).toMatch(/\.close\(\)/)
    expect(blob).not.toMatch(/shareShot|clipboard|writeText|serializeUrl|history\.replaceState/)
    expect(blob).not.toMatch(/from ['"]three['"]|@react-three|postprocessing|zustand/)
    expect(blob).not.toMatch(/FogExp2|smoothTime|balancedFx/)
    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies).not.toHaveProperty('broadcast-channel')
    expect(Object.keys(pkg.dependencies)).toHaveLength(11)

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../components/scene/DemandLoop.tsx',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/CameraRig.tsx',
      '../scene/fog.ts',
      '../scene/stage/cameraTransition.ts',
      '../scene/stage/prefetchLazyChunks.ts',
      '../viewmarks/shareShot.ts',
      '../url/urlState.ts',
      '../url/viewpoint.ts',
      '../store/viewSlice.ts',
      '../components/AlarmDrawer.tsx',
    ]
    for (const file of eager) {
      expect(read(file), file).not.toMatch(/BroadcastChannel|mountBroadcastBus|uniview-twin|bus\/mount/)
    }
  })
})
