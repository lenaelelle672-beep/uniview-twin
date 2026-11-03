import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isFloorId } from '../data/floors'
import { FOG_DENSITY } from '../scene/fog'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { resetTwinStore, useTwinStore } from '../store/store'
import { floorViewDomReady, floorViewTransitionProbe, installFloorViewTransition, isFloorToken } from './install'
import { mountFloorViewTransition } from './mount'
import {
  DOM_VIEW_TRANSITION_MS,
  FLOOR_VIEW_TRANSITION_CSS,
  ensureFloorViewTransitionStyle,
  prefersReducedMotion,
  runDomViewTransition,
  setFloorViewTransitionPorts,
  type DomViewTransition,
  type StartDomViewTransition,
} from './run'
import { VIEW_TRANSITION_SOURCE_BLOCK } from '../../scripts/viewTransitionPlugin'

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

function clearProbe(): void {
  delete (globalThis as { __twinViewTransition?: unknown }).__twinViewTransition
}

function useApi(start?: StartDomViewTransition | null, reduce = false): { calls: number } {
  const box = { calls: 0 }
  setFloorViewTransitionPorts({
    reduce,
    start:
      start === null
        ? null
        : (update) => {
            box.calls += 1
            if (start) return start(update)
            update()
            return { finished: Promise.resolve() }
          },
  })
  installFloorViewTransition()
  return box
}

beforeEach(() => {
  resetTwinStore()
  setFloorViewTransitionPorts(null)
  clearProbe()
})

afterEach(() => {
  resetTwinStore()
  setFloorViewTransitionPorts(null)
  clearProbe()
})

describe('DOM 过渡回退', () => {
  it('没有 API 时立刻写入', () => {
    let ran = false
    expect(runDomViewTransition(() => {
      ran = true
    })).toBe('instant')
    expect(ran).toBe(true)
    expect(prefersReducedMotion()).toBe(false)
  })

  it('有 API 时写入发生在回调里面，而且只写一次', () => {
    let seen = ''
    setFloorViewTransitionPorts({
      reduce: false,
      start(update) {
        seen = 'before'
        update()
        seen = 'after'
        return { finished: Promise.resolve() }
      },
    })
    let value = 0
    expect(runDomViewTransition(() => {
      expect(seen).toBe('before')
      value += 1
    })).toBe('transition')
    expect(value).toBe(1)
    expect(seen).toBe('after')
  })

  it('API 拒绝时立刻写入，回调抛错则不再写第二次', () => {
    setFloorViewTransitionPorts({
      reduce: false,
      start() {
        throw new Error('InvalidStateError')
      },
    })
    let value = 0
    expect(runDomViewTransition(() => {
      value += 1
    })).toBe('instant')
    expect(value).toBe(1)

    setFloorViewTransitionPorts({
      reduce: false,
      start(update) {
        update()
        throw new Error('boom')
      },
    })
    expect(() => runDomViewTransition(() => {
      value += 1
    })).toThrow('boom')
    expect(value).toBe(2)
  })

  it('减少动效时不调用 API', () => {
    let calls = 0
    setFloorViewTransitionPorts({
      reduce: true,
      start() {
        calls += 1
        return { finished: Promise.resolve() }
      },
    })
    expect(runDomViewTransition(() => {})).toBe('instant')
    expect(calls).toBe(0)
  })

  it('finished 被拒绝时不会变成未处理拒绝', async () => {
    const finished = Promise.reject(new Error('skip'))
    setFloorViewTransitionPorts({
      reduce: false,
      start(update) {
        update()
        return { finished, ready: Promise.reject(new Error('ready')), updateCallbackDone: Promise.reject(new Error('done')) }
      },
    })
    expect(runDomViewTransition(() => {})).toBe('transition')
    await expect(finished).rejects.toThrow('skip')
    await Promise.resolve()
  })

  it('回调稍后才跑时，写入仍留在回调里', async () => {
    let stage = 'before'
    setFloorViewTransitionPorts({
      reduce: false,
      start(update) {
        stage = 'started'
        queueMicrotask(() => {
          stage = 'inside'
          update()
          stage = 'after'
        })
        return { finished: Promise.resolve() }
      },
    })
    let value = 0
    expect(runDomViewTransition(() => {
      value += 1
    })).toBe('transition')
    expect(value).toBe(0)
    expect(stage).toBe('started')
    await Promise.resolve()
    expect(value).toBe(1)
    expect(stage).toBe('after')
  })

  it('回调返回的 Promise 原样交给浏览器，用来等新界面', () => {
    let returned: unknown
    setFloorViewTransitionPorts({
      reduce: false,
      start(update) {
        returned = update()
        return { finished: Promise.resolve() }
      },
    })
    const pending = Promise.resolve()
    expect(runDomViewTransition(() => pending)).toBe('transition')
    expect(returned).toBe(pending)
  })

  it('上一条还在时先跳过，再开始下一条', () => {
    let busy = false
    let skips = 0
    setFloorViewTransitionPorts({
      reduce: false,
      start(update) {
        if (busy) throw new Error('InvalidStateError')
        busy = true
        update()
        return {
          finished: new Promise<void>(() => {}),
          skipTransition() {
            skips += 1
            busy = false
          },
        }
      },
    })
    expect(runDomViewTransition(() => {})).toBe('transition')
    expect(runDomViewTransition(() => {})).toBe('transition')
    expect(skips).toBe(1)
    expect(busy).toBe(true)
  })
})

describe('楼层和视图切换', () => {
  it('视图变化包在回调里；同一视图不包', () => {
    let before = ''
    const box = useApi((update) => {
      before = useTwinStore.getState().view
      update()
      return { finished: Promise.resolve() }
    })
    useTwinStore.getState().setView('building')
    expect(box.calls).toBe(0)
    useTwinStore.getState().setView('blueprint')
    expect(before).toBe('building')
    expect(box.calls).toBe(1)
    expect(useTwinStore.getState().view).toBe('blueprint')
    expect(floorViewTransitionProbe()).toMatchObject({
      on: true,
      supported: true,
      transitions: 1,
      instants: 0,
      last: 'transition',
    })
  })

  it('进层、离层、单层内换层会包；非法楼层和重复进层不包', () => {
    const box = useApi()
    useTwinStore.getState().enterFloor('F99')
    expect(box.calls).toBe(0)
    expect(useTwinStore.getState().view).toBe('building')
    useTwinStore.getState().enterFloor('F8')
    expect(box.calls).toBe(1)
    expect(useTwinStore.getState()).toMatchObject({ view: 'floor', selectedFloor: 'F8' })
    useTwinStore.getState().enterFloor('F8')
    expect(box.calls).toBe(1)
    useTwinStore.getState().setSelectedFloor('F8')
    expect(box.calls).toBe(1)
    useTwinStore.getState().setSelectedFloor('F9')
    expect(box.calls).toBe(2)
    expect(useTwinStore.getState().selectedFloor).toBe('F9')
    useTwinStore.getState().exitFloor()
    expect(box.calls).toBe(3)
    expect(useTwinStore.getState().view).toBe('building')
    useTwinStore.getState().exitFloor()
    expect(box.calls).toBe(3)
  })

  it('总览单击只选中，不交叉淡化', () => {
    const box = useApi()
    useTwinStore.getState().setSelectedFloor('F5')
    expect(box.calls).toBe(0)
    expect(useTwinStore.getState()).toMatchObject({ view: 'building', selectedFloor: 'F5' })
    useTwinStore.getState().setSelectedFloor(null)
    expect(box.calls).toBe(0)
    expect(useTwinStore.getState().selectedFloor).toBeNull()
  })

  it('跨层聚焦和跨层视角会包，同层只改工位或机位不包', () => {
    const box = useApi()
    useTwinStore.getState().focusDevice({ floor: 'F12', deskId: 'F12-1' })
    expect(box.calls).toBe(1)
    expect(useTwinStore.getState()).toMatchObject({ view: 'floor', selectedFloor: 'F12', focusSeq: 1 })
    useTwinStore.getState().focusDevice({ floor: 'F12', deskId: 'F12-2', deviceId: 'F12-2-PC' })
    expect(box.calls).toBe(1)
    expect(useTwinStore.getState()).toMatchObject({ focusedDeskId: 'F12-2', focusedDeviceId: 'F12-2-PC', focusSeq: 2 })
    useTwinStore.getState().showViewpoint({ token: 'same', view: 'floor', floor: 'F12', cam: 'photo1' })
    expect(box.calls).toBe(1)
    expect(useTwinStore.getState()).toMatchObject({ cam: 'photo1', vp: 'same', vpSeq: 1 })
    useTwinStore.getState().showViewpoint({ token: 'next', view: 'building', floor: null, cam: null })
    expect(box.calls).toBe(2)
    expect(useTwinStore.getState()).toMatchObject({ view: 'building', selectedFloor: null, vpSeq: 2 })
  })

  it('没有 API 时视图仍然切过去', () => {
    const box = useApi(null)
    useTwinStore.getState().enterFloor('B1')
    expect(box.calls).toBe(0)
    expect(useTwinStore.getState()).toMatchObject({ view: 'floor', selectedFloor: 'B1' })
    expect(floorViewTransitionProbe()).toMatchObject({ supported: false, instants: 1, last: 'instant' })
  })

  it('减少动效时立刻切，不调用 API', () => {
    const box = useApi(() => {
      throw new Error('should not')
    }, true)
    useTwinStore.getState().setView('floor')
    expect(box.calls).toBe(0)
    expect(useTwinStore.getState().view).toBe('floor')
    expect(floorViewTransitionProbe()).toMatchObject({ supported: false, instants: 1, last: 'instant' })
  })

  it('API 抛错时楼层仍然写上，而且只写一次', () => {
    const box = useApi(() => {
      throw new Error('InvalidStateError')
    })
    useTwinStore.getState().enterFloor('F4')
    expect(box.calls).toBe(1)
    expect(useTwinStore.getState()).toMatchObject({ view: 'floor', selectedFloor: 'F4' })
    expect(floorViewTransitionProbe()?.last).toBe('instant')

    resetTwinStore()
    clearProbe()
    const boom = useApi((update) => {
      update()
      throw new Error('boom')
    })
    expect(() => useTwinStore.getState().focusDevice({ floor: 'F4', deskId: null })).toThrow('boom')
    expect(boom.calls).toBe(1)
    expect(useTwinStore.getState().focusSeq).toBe(1)
  })

  it('重复安装不会套两层；重置后可以再装', () => {
    const box = useApi()
    const wrapped = useTwinStore.getState().setView
    installFloorViewTransition()
    expect(useTwinStore.getState().setView).toBe(wrapped)
    useTwinStore.getState().setView('blueprint')
    expect(box.calls).toBe(1)
    resetTwinStore()
    setFloorViewTransitionPorts({
      reduce: false,
      start(update) {
        box.calls += 1
        update()
        return { finished: Promise.resolve() }
      },
    })
    installFloorViewTransition()
    expect(useTwinStore.getState().setView).not.toBe(wrapped)
    useTwinStore.getState().setView('floor')
    expect(box.calls).toBe(2)
    expect(useTwinStore.getState().view).toBe('floor')
  })

  it('楼层号和 isFloorId 同一条口径', () => {
    const samples = ['B1', 'F1', 'F9', 'F10', 'F22', 'F0', 'F00', 'F23', 'F99', '', 'f1', 'B2', 'F']
    for (const id of samples) expect(isFloorToken(id)).toBe(isFloorId(id))
    for (let level = 1; level <= 22; level += 1) expect(isFloorToken(`F${level}`)).toBe(true)
  })
})

describe('镜头、爆炸和悬停不走 DOM 过渡', () => {
  it('机位、爆炸、昼夜、画质、悬停、飞入请求和蓝图点选都不包', () => {
    const box = useApi()
    const setExploded = useTwinStore.getState().setExploded
    expect(useTwinStore.getState().setExploded).toBe(setExploded)
    useTwinStore.getState().setCam('east')
    useTwinStore.getState().setExploded(true)
    useTwinStore.getState().setDayNight('night')
    useTwinStore.getState().setQuality('perf')
    useTwinStore.getState().setHoveredFloor('F1')
    useTwinStore.getState().emitFloorFly('F4')
    useTwinStore.getState().setView('blueprint')
    useTwinStore.getState().selectDesk('F12-66')
    expect(box.calls).toBe(1)
    expect(useTwinStore.getState()).toMatchObject({
      cam: 'east',
      exploded: true,
      dayNight: 'night',
      quality: 'perf',
      hoveredFloor: 'F1',
      view: 'blueprint',
      selectedFloor: 'F12',
      focusedDeskId: 'F12-66',
      floorFlyRequest: { floorId: 'F4', nonce: 1 },
    })
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(DOM_VIEW_TRANSITION_MS).toBe(200)
    expect(DOM_VIEW_TRANSITION_MS).not.toBe(USER_CAMERA_SMOOTH_TIME * 1000)
  })
})

describe('新快照要等界面', () => {
  function doc(found: Record<string, string | null>) {
    return {
      querySelector(selector: string) {
        if (!(selector in found)) return null
        return { textContent: found[selector] }
      },
    }
  }

  it('蓝图要等到图纸节点，单层要等到返回按钮和楼层号', () => {
    expect(floorViewDomReady('blueprint', null, doc({}))).toBe(false)
    expect(floorViewDomReady('blueprint', null, doc({ '.blueprint': '请选择左侧楼层。' }))).toBe(true)
    expect(floorViewDomReady('floor', 'F8', doc({ 'button.back-button': '返回总览' }))).toBe(false)
    expect(
      floorViewDomReady('floor', 'F8', doc({ 'button.back-button': '返回总览', '.view-chip': '单层视图 · F9' })),
    ).toBe(false)
    expect(
      floorViewDomReady('floor', 'F8', doc({ 'button.back-button': '返回总览', '.view-chip': '单层视图 · F8' })),
    ).toBe(true)
    expect(
      floorViewDomReady('floor', 'F1', doc({ 'button.back-button': '返回总览', '.view-chip': '单层视图 · F10' })),
    ).toBe(false)
    expect(
      floorViewDomReady('floor', 'F1', doc({ 'button.back-button': '返回总览', '.view-chip': '单层视图 · F1' })),
    ).toBe(true)
    expect(floorViewDomReady('floor', null, doc({ 'button.back-button': '返回总览' }))).toBe(true)
    expect(floorViewDomReady('building', null, doc({ 'button.back-button': '返回总览' }))).toBe(false)
    expect(floorViewDomReady('building', null, doc({ 'button.explode-button': '爆炸视图' }))).toBe(true)
  })
})

describe('过渡样式', () => {
  it('只缩短根快照的交叉淡化，重复挂不会叠两份', () => {
    expect(FLOOR_VIEW_TRANSITION_CSS).toContain('::view-transition-old(root)')
    expect(FLOOR_VIEW_TRANSITION_CSS).toContain('::view-transition-new(root)')
    expect(FLOOR_VIEW_TRANSITION_CSS).toContain('200ms')
    expect(FLOOR_VIEW_TRANSITION_CSS).not.toMatch(/smoothTime|camera|gsap|anime/)
    const nodes: { dataset: { floorViewTransition?: string }; textContent: string }[] = []
    const doc = {
      nodes,
      head: {
        append(node: { dataset: { floorViewTransition?: string }; textContent: string }) {
          nodes.push(node)
        },
      },
      querySelector(selector: string) {
        if (selector !== 'style[data-floor-view-transition]') return null
        return nodes[0] ?? null
      },
      createElement() {
        return { dataset: {}, textContent: '' }
      },
    }
    ensureFloorViewTransitionStyle(doc)
    ensureFloorViewTransitionStyle(doc)
    expect(nodes).toHaveLength(1)
    expect(nodes[0]?.dataset.floorViewTransition).toBe('')
    expect(nodes[0]?.textContent).toBe(FLOOR_VIEW_TRANSITION_CSS)
  })

  it('没有 document 时挂载仍包住视图切换', () => {
    const box = { calls: 0 }
    setFloorViewTransitionPorts({
      reduce: false,
      start(update) {
        box.calls += 1
        update()
        return { finished: Promise.resolve() } satisfies DomViewTransition
      },
    })
    mountFloorViewTransition()
    mountFloorViewTransition()
    useTwinStore.getState().setView('blueprint')
    expect(box.calls).toBe(1)
    expect(floorViewTransitionProbe()?.on).toBe(true)
  })
})

describe('不进首屏', () => {
  it('晚挂在 dock 哈希之后，入口和镜头阻尼不带这段', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(read('../scene/stage/cameraTransition.ts')).toMatch(/USER_CAMERA_SMOOTH_TIME = 0\.42/)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)

    const dock = read('../viewmarks/dock.tsx')
    const plugin = read('../../scripts/viewTransitionPlugin.ts')
    const vite = read('../../vite.config.ts')
    const pkg = JSON.parse(read('../../package.json')) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }

    expect(dock).toContain(VIEW_TRANSITION_SOURCE_BLOCK)
    expect(dock).toMatch(/import\('\.\.\/view-transition\/mount'\)/)
    expect(dock).not.toMatch(/from ['"]\.\.\/view-transition/)
    expect(dock.replace(VIEW_TRANSITION_SOURCE_BLOCK, '')).toMatch(/mountKenneyFurniture\(\)\n\}\)\n\nconst LayerPanel/)
    expect(dock.replace(VIEW_TRANSITION_SOURCE_BLOCK, '')).not.toMatch(
      /mountFloorViewTransition|view-transition\/mount|startViewTransition/,
    )
    expect(plugin).toContain(VIEW_TRANSITION_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'view-transition-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/FloorViewTransition\.js/)
    expect(plugin).toMatch(/__twinViewTransitionStore/)
    expect(vite).toMatch(/viewTransitionAfterHash/)
    expect(vite.indexOf('kenneyFurnitureAfterHash()')).toBeLessThan(vite.indexOf('viewTransitionAfterHash()'))

    const blob = [read('./run.ts'), read('./install.ts'), read('./mount.ts')].join('\n')
    expect(blob).not.toMatch(
      /from ['"][^'"]*(cameraTransition|CameraRig|three|zustand|gsap|anime|postprocessing|balancedFx|DemandLoop|SoftShadows)/,
    )
    expect(blob).not.toMatch(/gsap|animejs|@react-spring|FogExp2|smoothTime|CameraControls/)
    expect(read('./install.ts')).toMatch(/from '\.\.\/store\/store'/)
    expect(read('./run.ts')).toMatch(/document\.startViewTransition|startViewTransition/)
    expect(read('./run.ts')).not.toMatch(/from '\.\.\/store\/store'/)

    const eager = [
      '../store/viewSlice.ts',
      '../scene/stage/cameraTransition.ts',
      '../components/scene/CameraRig.tsx',
      '../components/scene/DemandLoop.tsx',
      '../components/scene/BalancedSoftShadows.tsx',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/TopBar.tsx',
      '../components/FloorList.tsx',
      '../components/Stage.tsx',
      '../components/Scene.tsx',
      '../explode-progress/mount.ts',
      '../kenney-furniture/mount.ts',
      '../simready/mount.ts',
      '../index.css',
    ]
    for (const path of eager) {
      expect(read(path)).not.toMatch(/startViewTransition|view-transition\/mount|mountFloorViewTransition/)
    }

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
    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies['@react-three/postprocessing']).toBe('3.1.3')
    expect(pkg.dependencies.postprocessing).toBe('6.39.5')
    expect(pkg.dependencies.gsap).toBeUndefined()
    expect(pkg.dependencies.animejs).toBeUndefined()
    expect(pkg.devDependencies.gsap).toBeUndefined()
    expect(pkg.devDependencies.animejs).toBeUndefined()
  })
})
