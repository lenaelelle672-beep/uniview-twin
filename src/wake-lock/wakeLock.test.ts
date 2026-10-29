import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FOG_DENSITY } from '../scene/fog'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { WAKE_LOCK_SOURCE_BLOCK } from '../../scripts/wakeLockPlugin'
import { mountScreenWakeLock } from './mount'
import { initialWakeLockEnabled, wakeLockForceOff, wakeLockSupported } from './policy'
import { createWakeLockController, type WakePorts, type WakeSentinel } from './session'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

function flush(): Promise<void> {
  return Promise.resolve().then(() => Promise.resolve())
}

interface Sentinel extends WakeSentinel {
  id: number
  listeners: Set<() => void>
  release: () => Promise<void> | void
  fire: () => void
}

function makeSentinel(id: number, releaseImpl?: Sentinel['release']): Sentinel {
  const listeners = new Set<() => void>()
  const sentinel: Sentinel = {
    id,
    released: false,
    listeners,
    release: releaseImpl ?? (() => {
      if (sentinel.released) return Promise.resolve()
      sentinel.released = true
      for (const listener of [...listeners]) listener()
      return Promise.resolve()
    }),
    addEventListener(_type, listener) {
      listeners.add(listener)
    },
    fire() {
      if (sentinel.released) return
      sentinel.released = true
      for (const listener of [...listeners]) listener()
    },
  }
  return sentinel
}

function harness(patch?: {
  visible?: boolean
  supported?: boolean
  request?: WakePorts['request']
  release?: Sentinel['release']
}): {
  ports: WakePorts
  requests: string[]
  sentinels: Sentinel[]
  released: number[]
} {
  const requests: string[] = []
  const sentinels: Sentinel[] = []
  const released: number[] = []
  let seq = 0
  const ports: WakePorts = {
    visible: patch?.visible !== false,
    supported: patch?.supported !== false,
    request:
      patch?.request ??
      ((type) => {
        requests.push(type)
        const id = ++seq
        const sentinel = makeSentinel(id, () => {
          released.push(id)
          if (patch?.release) return patch.release()
          if (sentinel.released) return Promise.resolve()
          sentinel.released = true
          for (const listener of [...sentinel.listeners]) listener()
          return Promise.resolve()
        })
        sentinels.push(sentinel)
        return Promise.resolve(sentinel)
      }),
  }
  return { ports, requests, sentinels, released }
}

describe('常亮开关', () => {
  it('默认关，演示模式或 wakeLock=1 才开，wakeLock=0 盖过演示', () => {
    expect(initialWakeLockEnabled('')).toBe(false)
    expect(initialWakeLockEnabled('?q=balanced')).toBe(false)
    expect(initialWakeLockEnabled('?demo=1')).toBe(true)
    expect(initialWakeLockEnabled('?demoEdit=1')).toBe(true)
    expect(initialWakeLockEnabled('demo=1')).toBe(true)
    expect(initialWakeLockEnabled('?demo=0')).toBe(false)
    expect(initialWakeLockEnabled('?demo=10')).toBe(false)
    expect(initialWakeLockEnabled('?demoEdit=10')).toBe(false)
    expect(initialWakeLockEnabled('?wakeLock=1')).toBe(true)
    expect(initialWakeLockEnabled('?wakeLock=0')).toBe(false)
    expect(initialWakeLockEnabled('?wakeLock=0&demo=1')).toBe(false)
    expect(initialWakeLockEnabled('?demoEdit=1&wakeLock=0')).toBe(false)
    expect(initialWakeLockEnabled('?wakeLock=1&demo=0')).toBe(true)
    expect(initialWakeLockEnabled('?q=balanced', 'http://127.0.0.1:5190/?demo=1')).toBe(true)
    expect(initialWakeLockEnabled('?q=balanced', 'http://127.0.0.1:5190/?demoEdit=1')).toBe(true)
    expect(initialWakeLockEnabled('?wakeLock=0', 'http://127.0.0.1:5190/?demo=1')).toBe(false)
    expect(initialWakeLockEnabled('?demo=1', 'http://127.0.0.1:5190/?wakeLock=0')).toBe(false)
    expect(initialWakeLockEnabled('?wakeLock=1', 'http://127.0.0.1:5190/?wakeLock=0')).toBe(false)
    expect(wakeLockForceOff('?q=balanced', 'http://127.0.0.1:5190/?wakeLock=0')).toBe(true)
    expect(wakeLockForceOff('?wakeLock=1')).toBe(false)
    expect(() => initialWakeLockEnabled('', 'not a url')).not.toThrow()
    expect(initialWakeLockEnabled('', 'not a url')).toBe(false)
  })

  it('非安全上下文或没有 request 时不可用', () => {
    expect(wakeLockSupported(null)).toBe(false)
    expect(wakeLockSupported({ isSecureContext: false, wakeLock: { request() {} } })).toBe(false)
    expect(wakeLockSupported({ isSecureContext: true, wakeLock: null })).toBe(false)
    expect(wakeLockSupported({ isSecureContext: true, wakeLock: {} })).toBe(false)
    expect(wakeLockSupported({ isSecureContext: true, wakeLock: { request() {} } })).toBe(true)
    expect(wakeLockSupported({ wakeLock: { request() {} } })).toBe(true)
  })
})

describe('申请、释放、重获、降级', () => {
  it('可见时申请 screen，拿到哨兵后才算持有', async () => {
    const box = harness()
    const controller = createWakeLockController()
    expect(controller.enable(box.ports)).toMatchObject({ enabled: true, phase: 'armed', held: false })
    expect(box.requests).toEqual(['screen'])
    await flush()
    expect(controller.view()).toMatchObject({ enabled: true, phase: 'held', held: true })
    controller.enable(box.ports)
    await flush()
    expect(box.requests).toEqual(['screen'])
  })

  it('关掉时 release，之后可见也不再申请', async () => {
    const box = harness()
    const controller = createWakeLockController()
    controller.enable(box.ports)
    await flush()
    expect(controller.disable(box.ports)).toMatchObject({ enabled: false, phase: 'off', held: false })
    expect(box.released).toEqual([1])
    box.ports.visible = false
    controller.onVisibility(box.ports)
    box.ports.visible = true
    controller.onVisibility(box.ports)
    await flush()
    expect(box.requests).toEqual(['screen'])
    expect(controller.view().phase).toBe('off')
  })

  it('隐藏释放后，回到可见再申请', async () => {
    const box = harness()
    const controller = createWakeLockController()
    controller.enable(box.ports)
    await flush()
    box.ports.visible = false
    expect(controller.onVisibility(box.ports)).toMatchObject({ enabled: true, phase: 'armed', held: false })
    expect(box.requests).toEqual(['screen'])
    expect(box.released).toEqual([1])
    box.ports.visible = true
    controller.onVisibility(box.ports)
    await flush()
    expect(box.requests).toEqual(['screen', 'screen'])
    expect(controller.view()).toMatchObject({ phase: 'held', held: true })
  })

  it('文档不可见时不申请，可见后再申请', async () => {
    const box = harness({ visible: false })
    const controller = createWakeLockController()
    expect(controller.enable(box.ports)).toMatchObject({ enabled: true, phase: 'armed', held: false })
    expect(box.requests).toEqual([])
    box.ports.visible = true
    controller.onVisibility(box.ports)
    await flush()
    expect(box.requests).toEqual(['screen'])
    expect(controller.view().held).toBe(true)
  })

  it('在途申请赶上隐藏时要放掉，不能在不可见时持有', async () => {
    const waiting: Array<(sentinel: WakeSentinel) => void> = []
    const box = harness({
      request: (type) => {
        box.requests.push(type)
        return new Promise((resolve) => {
          waiting.push(resolve)
        })
      },
    })
    const controller = createWakeLockController()
    controller.enable(box.ports)
    expect(box.requests).toEqual(['screen'])
    box.ports.visible = false
    controller.onVisibility(box.ports)
    const late = makeSentinel(9, () => {
      box.released.push(9)
      late.released = true
      return Promise.resolve()
    })
    waiting[0]?.(late)
    await flush()
    expect(box.released).toEqual([9])
    expect(controller.view()).toMatchObject({ enabled: true, phase: 'armed', held: false })
    box.ports.visible = true
    controller.onVisibility(box.ports)
    const next = makeSentinel(2)
    waiting[1]?.(next)
    await flush()
    expect(box.requests).toEqual(['screen', 'screen'])
    expect(controller.view()).toMatchObject({ phase: 'held', held: true })
  })

  it('关掉之后迟到的申请也会 release，不会重新持有', async () => {
    const requests: string[] = []
    const released: number[] = []
    let resolveRequest: (sentinel: WakeSentinel) => void = () => {}
    const box = harness({
      request: (type) => {
        requests.push(type)
        return new Promise<WakeSentinel>((resolve) => {
          resolveRequest = resolve
        })
      },
    })
    const controller = createWakeLockController()
    controller.enable(box.ports)
    controller.disable(box.ports)
    const late = makeSentinel(4, () => {
      released.push(4)
      late.released = true
      return Promise.resolve()
    })
    resolveRequest(late)
    await flush()
    expect(requests).toEqual(['screen'])
    expect(released).toEqual([4])
    expect(controller.view()).toMatchObject({ enabled: false, phase: 'off', held: false })
  })

  it('request 拒绝、抛错或接口缺失时降级，不向外抛', async () => {
    const rejected = harness({
      request: () => Promise.reject(new Error('denied')),
    })
    const controller = createWakeLockController()
    expect(() => controller.enable(rejected.ports)).not.toThrow()
    await flush()
    expect(controller.view()).toMatchObject({ enabled: true, phase: 'degraded', held: false })

    const thrown = harness({
      request: () => {
        throw new Error('boom')
      },
    })
    const failing = createWakeLockController()
    expect(() => failing.enable(thrown.ports)).not.toThrow()
    expect(failing.view()).toMatchObject({ enabled: true, phase: 'degraded', held: false })

    const missing = harness({ supported: false })
    const blind = createWakeLockController()
    expect(() => blind.enable(missing.ports)).not.toThrow()
    expect(missing.requests).toEqual([])
    expect(blind.view().phase).toBe('degraded')

    const empty = harness({
      request: () => null as unknown as Promise<WakeSentinel>,
    })
    const hollow = createWakeLockController()
    expect(() => hollow.enable(empty.ports)).not.toThrow()
    expect(hollow.view().phase).toBe('degraded')
  })

  it('release 抛错或拒绝时关掉仍然成功', async () => {
    const box = harness({
      release: () => {
        throw new Error('stuck')
      },
    })
    const controller = createWakeLockController()
    controller.enable(box.ports)
    await flush()
    expect(() => controller.disable(box.ports)).not.toThrow()
    expect(controller.view()).toMatchObject({ enabled: false, phase: 'off', held: false })

    const rejecting = harness({
      release: () => Promise.reject(new Error('later')),
    })
    const other = createWakeLockController()
    other.enable(rejecting.ports)
    await flush()
    expect(() => other.disable(rejecting.ports)).not.toThrow()
    await flush()
    expect(other.view().phase).toBe('off')
  })

  it('系统在可见时释放只降级，下一次回到可见再申请', async () => {
    const box = harness()
    const controller = createWakeLockController()
    controller.enable(box.ports)
    await flush()
    box.sentinels[0]?.fire()
    expect(controller.view()).toMatchObject({ enabled: true, phase: 'degraded', held: false })
    expect(box.requests).toEqual(['screen'])
    box.ports.visible = false
    controller.onVisibility(box.ports)
    box.ports.visible = true
    controller.onVisibility(box.ports)
    await flush()
    expect(box.requests).toEqual(['screen', 'screen'])
    expect(controller.view().held).toBe(true)
  })

  it('已经在申请时不会再发第二次', async () => {
    const requests: string[] = []
    let resolveRequest: (sentinel: WakeSentinel) => void = () => {}
    const box = harness({
      request: (type) => {
        requests.push(type)
        return new Promise<WakeSentinel>((resolve) => {
          resolveRequest = resolve
        })
      },
    })
    const controller = createWakeLockController()
    controller.enable(box.ports)
    controller.enable(box.ports)
    expect(requests).toEqual(['screen'])
    resolveRequest(makeSentinel(1))
    await flush()
    expect(controller.view().held).toBe(true)
  })
})

describe('常亮分包不进首屏', () => {
  it('懒挂在 dock 哈希之后，手势或演示才申请，失败不进主路径', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(read('../scene/stage/cameraTransition.ts')).toMatch(/USER_CAMERA_SMOOTH_TIME = 0\.42/)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)

    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const session = read('./session.ts')
    const policy = read('./policy.ts')
    const plugin = read('../../scripts/wakeLockPlugin.ts')
    const vite = read('../../vite.config.ts')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }

    expect(dock).toContain(WAKE_LOCK_SOURCE_BLOCK)
    expect(dock).toMatch(/import\('\.\.\/wake-lock\/mount'\)/)
    expect(dock).toMatch(/mountScreenWakeLock\(\)/)
    expect(dock).not.toMatch(/from '\.\.\/wake-lock\/mount'/)
    expect(dock.replace(WAKE_LOCK_SOURCE_BLOCK, '')).not.toMatch(/mountScreenWakeLock|wake-lock\/mount/)
    expect(plugin).toContain(WAKE_LOCK_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'wake-lock-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/WakeLock\.js/)
    expect(vite).toMatch(/wakeLockAfterHash/)
    expect(vite.indexOf('broadcastAfterHash()')).toBeLessThan(vite.indexOf('wakeLockAfterHash()'))

    const click = mount.slice(mount.indexOf('function onClick'), mount.indexOf('function ensureButton'))
    expect(click).toMatch(/controller\.enable\(browserPorts\(\)\)/)
    expect(click).toMatch(/controller\.disable\(browserPorts\(\)\)/)
    expect(click).not.toMatch(/await |\.then\(/)
    expect(mount).toMatch(/visibilitychange/)
    expect(mount).toMatch(/addEventListener\('click', onClick\)/)
    expect(mount).toMatch(/initialWakeLockEnabled\(\)/)
    expect(mount).toMatch(/visibilityState === 'visible'/)
    expect(mount).not.toMatch(/console\./)
    expect(session).toMatch(/request\('screen'\)/)
    expect(session).not.toMatch(/document\.|navigator\.|window\.|console\.|requestFullscreen|requestPictureInPicture/)
    expect(policy).toMatch(/wakeLock/)
    expect(policy).toMatch(/demoEdit/)
    expect(policy).not.toMatch(/console\.|requestFullscreen|FogExp2/)

    const blob = [mount, session, policy].join('\n')
    expect(blob).not.toMatch(
      /from ['"][^'"]*(fullscreen|fog|cameraTransition|balancedFx|three|zustand|postprocessing|pip\/|audio\/|bus\/|drag-placement)/,
    )
    expect(blob).not.toMatch(
      /Reflector|transmission|Vignette|ssgi|pathtracer|jsdelivr|FloorBadges|FogExp2|smoothTime|howler|ccapture|DragControls/i,
    )

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
      '../pip/mount.ts',
      '../pip/session.ts',
      '../audio/AlarmSpeech.ts',
      '../bus/mount.ts',
      '../drag-placement/mount.ts',
      '../screen-image/mount.ts',
    ]
    for (const file of eager) {
      expect(read(file), file).not.toMatch(/mountScreenWakeLock|wake-lock\/mount|__twinWakeLock/)
    }

    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(Object.keys(pkg.dependencies)).not.toContain('nosleep')
    expect(mountScreenWakeLock).toBeTypeOf('function')
    expect(() => mountScreenWakeLock()).not.toThrow()
  })
})
