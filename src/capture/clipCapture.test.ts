import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import {
  CLIP_FILENAME,
  CLIP_MAX_MS,
  CLIP_MIN_MS,
  clipBlob,
  clipStopAt,
  holdContinuousFrameloop,
  pickClipMime,
  rootStateFromScene,
  type ClipClock,
  type ClipFrameloop,
  type FrameloopMode,
} from './clipPolicy'
import { createClipController, type ClipCanvas, type ClipPorts, type ClipRecorder, type ClipStreamTrack } from './clipSession'
import { mountClipCapture } from './mountClip'

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

function clockAt(elapsedTime: number): ClipClock {
  return { elapsedTime }
}

function loopState(elapsedTime: number, setFrameloop?: ClipFrameloop['setFrameloop']): ClipFrameloop & { clock: ClipClock } {
  const clock = clockAt(elapsedTime)
  const state: ClipFrameloop & { clock: ClipClock } = {
    frameloop: 'demand',
    clock,
    setFrameloop(mode) {
      clock.elapsedTime = 0
      state.frameloop = mode
      setFrameloop?.(mode)
    },
  }
  return state
}

interface Harness {
  ports: ClipPorts
  modes: FrameloopMode[]
  clock: ClipClock
  downloads: Blob[]
  frames: { count: number }
  streamFps: number[]
  created: number
  rafs: Array<() => void>
  timers: Array<{ id: number; at: number; fn: () => void }>
  now: number
  trackStops: number
  error: (() => void) | null
}

function harness(patch?: {
  canvas?: ClipCanvas | null
  mime?: string | null
  start?: () => void
  create?: () => ClipRecorder
  download?: (blob: Blob, filename: string) => void
  kick?: () => void | Promise<void>
  schedule?: (fn: () => void, ms: number) => number
  raf?: (fn: () => void) => void
  frameloop?: ClipFrameloop | null
  manualTrack?: ClipStreamTrack
  timedTrack?: ClipStreamTrack
}): Harness {
  const modes: FrameloopMode[] = []
  const clock = clockAt(8)
  const frameloop = patch?.frameloop === undefined ? loopState(8, (mode) => modes.push(mode)) : patch.frameloop
  if (frameloop && frameloop.clock) frameloop.clock.elapsedTime = 8
  const downloads: Blob[] = []
  const frames = { count: 0 }
  const streamFps: number[] = []
  const rafs: Array<() => void> = []
  const timers: Array<{ id: number; at: number; fn: () => void }> = []
  let now = 1_000
  let nextId = 1
  let created = 0
  let trackStops = 0
  let error: (() => void) | null = null
  const track: ClipStreamTrack = patch?.timedTrack ?? {
    requestFrame() {
      frames.count += 1
    },
    stop() {
      trackStops += 1
    },
  }
  const canvas: ClipCanvas = {
    width: 16,
    height: 9,
    captureStream(fps = 0) {
      streamFps.push(fps)
      if (fps === 0 && patch?.manualTrack) return { getVideoTracks: () => [patch.manualTrack as ClipStreamTrack] }
      return { getVideoTracks: () => [track] }
    },
  }
  const listeners: Record<string, (event: { data?: Blob }) => void> = {}
  const ports: ClipPorts = {
    canvas: patch && 'canvas' in patch ? (patch.canvas ?? null) : canvas,
    frameloop,
    now: () => now,
    mime: patch && 'mime' in patch ? (patch.mime ?? null) : 'video/webm;codecs=vp9',
    createRecorder: () => {
      created += 1
      if (patch?.create) return patch.create()
      let state = 'inactive'
      const recorder: ClipRecorder = {
        get state() {
          return state
        },
        start() {
          patch?.start?.()
          state = 'recording'
        },
        stop() {
          state = 'inactive'
          listeners.dataavailable?.({ data: new Blob([Uint8Array.from([9, 8, 7])], { type: 'video/webm' }) })
          listeners.stop?.({})
        },
        addEventListener(type, listener) {
          listeners[type] = listener
          if (type === 'error') error = () => listener({})
        },
      }
      return recorder
    },
    download(blob, filename) {
      if (patch?.download) {
        patch.download(blob, filename)
        return
      }
      expect(filename).toBe(CLIP_FILENAME)
      downloads.push(blob)
    },
    kickFrame: patch?.kick ?? (() => Promise.resolve()),
    raf: patch?.raf ?? ((fn) => rafs.push(fn)),
    schedule:
      patch?.schedule ??
      ((fn, ms) => {
        const id = nextId
        nextId += 1
        timers.push({ id, at: now + ms, fn })
        return id
      }),
    clear(id) {
      const index = timers.findIndex((timer) => timer.id === id)
      if (index >= 0) timers.splice(index, 1)
    },
  }
  return {
    ports,
    modes,
    clock: frameloop?.clock ?? clock,
    downloads,
    frames,
    streamFps,
    get created() {
      return created
    },
    rafs,
    timers,
    get now() {
      return now
    },
    set now(value: number) {
      now = value
    },
    get trackStops() {
      return trackStops
    },
    get error() {
      return error
    },
  }
}

function fireDue(box: Harness): void {
  const due = box.timers.filter((timer) => timer.at <= box.now).sort((a, b) => a.at - b.at)
  for (const timer of due) {
    const index = box.timers.indexOf(timer)
    if (index < 0) continue
    box.timers.splice(index, 1)
    timer.fn()
  }
}

async function stepPump(box: Harness): Promise<void> {
  const batch = box.rafs.splice(0, box.rafs.length)
  for (const fn of batch) fn()
  await Promise.resolve()
  await Promise.resolve()
}

describe('短视频时长与编码', () => {
  it('停在 5 到 15 秒之间', () => {
    expect(CLIP_MIN_MS).toBe(5_000)
    expect(CLIP_MAX_MS).toBe(15_000)
    expect(clipStopAt(0, 0, false)).toBe(15_000)
    expect(clipStopAt(100, 100, false)).toBe(15_100)
    expect(clipStopAt(0, 1_000, true)).toBe(5_000)
    expect(clipStopAt(0, 5_000, true)).toBe(5_000)
    expect(clipStopAt(0, 8_000, true)).toBe(8_000)
    expect(clipStopAt(0, 20_000, true)).toBe(15_000)
  })

  it('只选 webm，探测抛错就跳过', () => {
    expect(pickClipMime(() => false)).toBeNull()
    expect(pickClipMime((mime) => mime.endsWith('webm'))).toBe('video/webm')
    expect(
      pickClipMime((mime) => {
        if (mime.includes('vp9')) throw new Error('no-vp9')
        return mime.includes('vp8')
      }),
    ).toBe('video/webm;codecs=vp8')
    expect(pickClipMime(() => {
      throw new Error('probe')
    })).toBeNull()
  })

  it('空块不下成文件', () => {
    expect(clipBlob([], 'video/webm')).toBeNull()
    expect(clipBlob([new Blob([])], 'video/webm')).toBeNull()
    const blob = clipBlob([new Blob([Uint8Array.from([1])])], 'video/webm;codecs=vp9')
    expect(blob?.size).toBe(1)
    expect(blob?.type).toBe('video/webm;codecs=vp9')
  })
})

describe('frameloop', () => {
  it('录制期切到 always，结束回到 demand，时钟不归零', () => {
    const modes: FrameloopMode[] = []
    const state = loopState(12.5, (mode) => modes.push(mode))
    const restore = holdContinuousFrameloop(state)
    expect(state.frameloop).toBe('always')
    expect(state.clock.elapsedTime).toBe(12.5)
    state.clock.elapsedTime = 13.25
    restore()
    expect(state.frameloop).toBe('demand')
    expect(state.clock.elapsedTime).toBe(13.25)
    expect(modes).toEqual(['always', 'demand'])
    restore()
    expect(modes).toEqual(['always', 'demand'])
  })

  it('没有 root 或 setFrameloop 抛错时不向外抛', () => {
    expect(holdContinuousFrameloop(null)()).toBeUndefined()
    const clock = clockAt(4)
    const state: ClipFrameloop = {
      frameloop: 'demand',
      clock,
      setFrameloop(mode) {
        clock.elapsedTime = 0
        if (mode === 'always') throw new Error('blocked')
        state.frameloop = mode
      },
    }
    const restore = holdContinuousFrameloop(state)
    expect(clock.elapsedTime).toBe(4)
    expect(state.frameloop).toBe('demand')
    restore()
    expect(state.frameloop).toBe('demand')
  })

  it('从场景上的 __r3f 读 root，不读 fiber 包', () => {
    expect(rootStateFromScene(null)).toBeNull()
    expect(rootStateFromScene({})).toBeNull()
    expect(rootStateFromScene({ __r3f: { root: { getState: () => ({}) } } })).toBeNull()
    const state = loopState(1)
    expect(rootStateFromScene({ __r3f: { root: { getState: () => state } } })).toBe(state)
  })
})

describe('录制会话', () => {
  it('手势里同步开流并切 frameloop，15 秒到点下载 webm 后恢复 demand', () => {
    const box = harness()
    const order: string[] = []
    box.ports.canvas = {
      width: 4,
      height: 4,
      captureStream(fps = 0) {
        order.push(`stream:${fps}`)
        box.streamFps.push(fps)
        return {
          getVideoTracks: () => [
            {
              requestFrame() {
                box.frames.count += 1
              },
              stop() {
                order.push('track-stop')
              },
            },
          ],
        }
      },
    }
    const realCreate = box.ports.createRecorder
    box.ports.createRecorder = (stream, mime) => {
      order.push('recorder')
      const recorder = realCreate(stream, mime)
      const start = recorder.start
      recorder.start = (timeslice) => {
        order.push(`start:${timeslice ?? ''}`)
        start(timeslice)
      }
      return recorder
    }
    const previous = box.ports.frameloop?.setFrameloop.bind(box.ports.frameloop)
    if (box.ports.frameloop && previous) {
      box.ports.frameloop.setFrameloop = (mode) => {
        order.push(mode)
        previous(mode)
      }
    }
    const controller = createClipController()
    expect(controller.toggle(box.ports)).toBe('recording')
    expect(order.slice(0, 4)).toEqual(['stream:0', 'recorder', 'always', 'start:500'])
    expect(box.clock.elapsedTime).toBe(8)
    box.clock.elapsedTime = 9.5
    box.now = 1_000 + CLIP_MAX_MS
    fireDue(box)
    expect(box.downloads).toHaveLength(1)
    expect(box.downloads[0]?.type).toBe('video/webm;codecs=vp9')
    expect(box.downloads[0]?.size).toBeGreaterThan(0)
    expect(box.modes).toEqual(['always', 'demand'])
    expect(box.clock.elapsedTime).toBe(9.5)
    expect(controller.phase()).toBe('idle')
    expect(order).toContain('track-stop')
  })

  it('5 秒前的停止会等到 5 秒，之后的停止马上结束', () => {
    const early = harness()
    const controller = createClipController()
    controller.toggle(early.ports)
    early.now = 3_000
    expect(controller.toggle(early.ports)).toBe('recording')
    expect(early.downloads).toHaveLength(0)
    expect(early.modes).toEqual(['always'])
    early.now = 6_000
    fireDue(early)
    expect(early.downloads).toHaveLength(1)
    expect(early.modes).toEqual(['always', 'demand'])

    const later = harness()
    const again = createClipController()
    again.toggle(later.ports)
    later.now = 7_000
    expect(again.toggle(later.ports)).toBe('idle')
    expect(later.downloads).toHaveLength(1)
    expect(later.modes).toEqual(['always', 'demand'])
  })

  it('泵帧在画完后 requestFrame，停录后不再泵', async () => {
    const box = harness()
    const controller = createClipController()
    controller.toggle(box.ports)
    await stepPump(box)
    await stepPump(box)
    expect(box.frames.count).toBeGreaterThan(0)
    box.now = 1_000 + CLIP_MAX_MS
    fireDue(box)
    const frames = box.frames.count
    await stepPump(box)
    expect(box.frames.count).toBe(frames)
    expect(box.modes.at(-1)).toBe('demand')
  })

  it('没有 requestFrame 时退回 30fps，仍然不抛', () => {
    const box = harness({
      manualTrack: {
        stop() {
          box.streamFps.push(-1)
        },
      },
    })
    const controller = createClipController()
    expect(controller.toggle(box.ports)).toBe('recording')
    expect(box.streamFps[0]).toBe(0)
    expect(box.streamFps).toContain(30)
  })

  it('禁录路径不抛，也不把 frameloop 留在 always', () => {
    const missing = harness({ canvas: null })
    expect(createClipController().toggle(missing.ports)).toBe('idle')
    expect(missing.modes).toEqual([])

    const noMime = harness({ mime: null })
    expect(createClipController().toggle(noMime.ports)).toBe('idle')
    expect(noMime.modes).toEqual([])

    const blind = harness()
    blind.ports.canvas = {
      width: 2,
      height: 2,
      captureStream() {
        throw new Error('tainted')
      },
    }
    expect(() => createClipController().toggle(blind.ports)).not.toThrow()
    expect(blind.modes).toEqual([])

    const empty = harness()
    empty.ports.canvas = { width: 0, height: 0, captureStream: () => ({ getVideoTracks: () => [] }) }
    expect(createClipController().toggle(empty.ports)).toBe('idle')

    const rejected = harness({
      create: () => {
        throw new Error('no-recorder')
      },
    })
    expect(() => createClipController().toggle(rejected.ports)).not.toThrow()
    expect(rejected.modes).toEqual([])

    const startFails = harness({
      start() {
        throw new Error('no-start')
      },
    })
    expect(createClipController().toggle(startFails.ports)).toBe('idle')
    expect(startFails.modes).toEqual(['always', 'demand'])
    expect(startFails.clock.elapsedTime).toBe(8)

    const blank = harness()
    blank.ports.createRecorder = () => ({
      state: 'inactive',
      start() {
        this.state = 'recording'
      },
      stop() {
        this.state = 'inactive'
      },
      addEventListener(type, listener) {
        if (type === 'stop') listener({})
      },
    })
    const blankController = createClipController()
    blankController.toggle(blank.ports)
    blank.now = 1_000 + CLIP_MAX_MS
    expect(() => fireDue(blank)).not.toThrow()
    expect(blank.downloads).toHaveLength(0)
    expect(blank.modes).toEqual(['always', 'demand'])

    const denied = harness({
      download() {
        throw new Error('blocked')
      },
    })
    const deniedController = createClipController()
    deniedController.toggle(denied.ports)
    denied.now = 1_000 + CLIP_MAX_MS
    expect(() => fireDue(denied)).not.toThrow()
    expect(denied.modes).toEqual(['always', 'demand'])
    expect(deniedController.phase()).toBe('idle')
  })

  it('录制中途出错或画布卸掉也回到 demand', async () => {
    const broken = harness()
    const controller = createClipController()
    controller.toggle(broken.ports)
    expect(() => broken.error?.()).not.toThrow()
    expect(controller.phase()).toBe('idle')
    expect(broken.modes).toEqual(['always', 'demand'])

    const gone = harness()
    const live = createClipController()
    live.toggle(gone.ports)
    if (gone.ports.canvas) gone.ports.canvas.isConnected = false
    await stepPump(gone)
    expect(live.phase()).toBe('idle')
    expect(gone.modes.at(-1)).toBe('demand')
  })
})

describe('录制分包不进首屏', () => {
  it('按钮在书签条上，捕获逻辑跟着 dock 晚加载', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mountClip.ts')
    const session = read('./clipSession.ts')
    const policy = read('./clipPolicy.ts')
    const vite = read('../../vite.config.ts')
    const blockStart = vite.indexOf('const CLIP_SOURCE_BLOCK = `')
    const block = vite.slice(blockStart + 'const CLIP_SOURCE_BLOCK = `'.length, vite.indexOf('`', blockStart + 28))
    expect(block).toMatch(/import\('\.\.\/capture\/mountClip'\)/)
    expect(dock).toContain(block)
    expect(dock).toMatch(/import\('\.\.\/capture\/mountClip'\)/)
    expect(dock).not.toMatch(/from '\.\.\/capture\/mountClip'/)
    expect(vite).toMatch(/clip-capture-after-hash/)
    expect(vite).toMatch(/assets\/ClipCapture\.js/)
    expect(vite).toMatch(/apply: 'build'/)
    expect(mount).toMatch(/录制/)
    expect(mount).toMatch(/停止/)
    expect(mount).toMatch(/data-share-shot/)
    expect(mount).toMatch(/addEventListener\('click'/)
    expect(mount).not.toMatch(/await import/)
    expect(mount).toMatch(/captureStream/)
    expect(session).toMatch(/new MediaRecorder|createRecorder/)
    expect(session).toMatch(/requestFrame/)
    expect(policy).toMatch(/setFrameloop\('always'\)/)
    expect(policy).toMatch(/setFrameloop\('demand'\)/)
    expect(policy).toMatch(/elapsedTime/)
    expect(mountClipCapture).toBeTypeOf('function')
    expect(() => mountClipCapture()).not.toThrow()

    const blob = [mount, session, policy].join('\n')
    expect(blob).not.toMatch(/ccapture/i)
    expect(blob).not.toMatch(/from ['"]three['"]|@react-three|postprocessing|zustand/)
    expect(blob).not.toMatch(/Reflector|transmission|Vignette|ssgi|pathtracer|jsdelivr|FloorBadges|FogExp2/i)

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
      '../viewmarks/shareShot.ts',
      '../viewmarks/ViewmarkDock.tsx',
    ]
    for (const file of eager) {
      expect(read(file), file).not.toMatch(/mountClip|ClipCapture|ccapture|录制/)
    }
    const scene = read('../components/Scene.tsx')
    expect(scene).toMatch(/frameloop="demand"/)
    expect(scene).not.toMatch(/setFrameloop/)
    const pkg = read('../../package.json')
    expect(Object.keys(JSON.parse(pkg).dependencies as Record<string, string>).sort()).toEqual(
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
    expect(pkg).not.toMatch(/ccapture/i)
  })
})
