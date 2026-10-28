import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FOG_DENSITY } from '../scene/fog'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { PIP_SOURCE_BLOCK } from '../../scripts/pipPlugin'
import { mountPipWatch } from './mount'
import {
  PIP_CONTINUE_MS,
  PIP_FALLBACK_FPS,
  applySilentVideo,
  pipApiAvailable,
  pipDisabled,
  pipOffFromSearch,
  type SilentVideoSink,
} from './policy'
import { createPipController, type PipCanvas, type PipPorts, type PipStream, type PipTrack, type PipVideo } from './session'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

interface Harness {
  ports: PipPorts
  canvas: PipCanvas
  video: PipVideo
  track: PipTrack & { stopped: boolean; frames: number }
  fps: number[]
  kicks: number
  exitCalls: number
  queued: Array<{ id: number; fn: () => void }>
  fireLeave: () => void
}

function harness(patch?: {
  disabled?: boolean
  supported?: boolean
  requestFrame?: boolean
  fallbackThrows?: boolean
  request?: () => Promise<unknown>
  play?: () => Promise<void> | void
  width?: number
  connected?: boolean
}): Harness {
  const fps: number[] = []
  const queued: Array<{ id: number; fn: () => void }> = []
  let kicks = 0
  let exitCalls = 0
  let seq = 1
  const manualHasFrame = patch?.requestFrame !== false
  const track: PipTrack & { stopped: boolean; frames: number } = {
    stopped: false,
    frames: 0,
    requestFrame: () => {
      track.frames += 1
    },
    stop: () => {
      track.stopped = true
    },
  }
  const canvas: PipCanvas = {
    width: patch?.width ?? 320,
    height: patch?.width === 0 ? 0 : 180,
    isConnected: patch?.connected !== false,
    captureStream(frameRate = 0) {
      fps.push(frameRate)
      if (frameRate !== 0 && patch?.fallbackThrows) throw new Error('no-fallback')
      const stream: PipStream = {
        getVideoTracks: () => {
          if (frameRate === 0 && !manualHasFrame) {
            return [{ stop: () => {} }]
          }
          if (frameRate === 0 && manualHasFrame) return [track]
          return [track]
        },
      }
      return stream
    },
  }
  let onLeave: (() => void) | null = null
  const video: PipVideo = {
    muted: false,
    volume: 1,
    controls: true,
    autoplay: true,
    playsInline: false,
    disablePictureInPicture: true,
    srcObject: null,
    play: patch?.play ?? (() => Promise.resolve()),
    pause: () => {},
    requestPictureInPicture: patch?.request ?? (() => Promise.resolve()),
    addEventListener: (_type, listener) => {
      onLeave = listener
    },
    removeEventListener: () => {
      onLeave = null
    },
  }
  const ports: PipPorts = {
    disabled: patch?.disabled ?? false,
    supported: patch?.supported !== false,
    canvas,
    video,
    activeElement: null,
    exitPictureInPicture: () => {
      exitCalls += 1
      return Promise.resolve()
    },
    kickFrame: () => {
      kicks += 1
    },
    schedule: (fn, ms) => {
      if (ms !== PIP_CONTINUE_MS) throw new Error(`continue ${ms}`)
      const id = seq
      seq += 1
      queued.push({ id, fn })
      return id
    },
    clear: (id) => {
      const index = queued.findIndex((item) => item.id === id)
      if (index >= 0) queued.splice(index, 1)
    },
  }
  return {
    ports,
    canvas,
    video,
    track,
    get fps() {
      return fps
    },
    get kicks() {
      return kicks
    },
    get exitCalls() {
      return exitCalls
    },
    queued,
    fireLeave: () => onLeave?.(),
  }
}

describe('画中画开关', () => {
  it('只认 nopip=1，原始导航地址也能读到', () => {
    expect(pipOffFromSearch('?nopip=1')).toBe(true)
    expect(pipOffFromSearch('nopip=1&q=balanced')).toBe(true)
    expect(pipOffFromSearch('?q=balanced&nopip=1')).toBe(true)
    expect(pipOffFromSearch('?nopip=0')).toBe(false)
    expect(pipOffFromSearch('?q=perf')).toBe(false)
    expect(pipDisabled('?nopip=1', null)).toBe(true)
    expect(pipDisabled('?q=balanced', 'http://127.0.0.1:5190/?nopip=1')).toBe(true)
    expect(pipDisabled('', 'http://127.0.0.1:5190/?q=balanced')).toBe(false)
    expect(pipDisabled('?nopip=1', 'not a url')).toBe(true)
    expect(pipDisabled('', 'not a url')).toBe(false)
    expect(pipDisabled('', null)).toBe(false)
  })

  it('没有 API 或被权限关掉时不可用', () => {
    expect(pipApiAvailable(null)).toBe(false)
    expect(pipApiAvailable({ pictureInPictureEnabled: false, requestPictureInPicture: () => undefined })).toBe(false)
    expect(pipApiAvailable({ pictureInPictureEnabled: true })).toBe(false)
    expect(pipApiAvailable({ requestPictureInPicture: () => Promise.resolve() })).toBe(true)
  })

  it('视频保持静默，并且不会自己播放或自己进入画中画', () => {
    const video: SilentVideoSink = {
      muted: false,
      volume: 1,
      controls: true,
      autoplay: true,
      playsInline: false,
      disablePictureInPicture: true,
    }
    applySilentVideo(video)
    expect(video).toEqual({
      muted: true,
      volume: 0,
      controls: false,
      autoplay: false,
      playsInline: true,
      disablePictureInPicture: false,
    })
  })
})

describe('手势进入和退出', () => {
  it('同步 captureStream(0) 和 requestPictureInPicture，视频静音', () => {
    const box = harness()
    const order: string[] = []
    box.canvas.captureStream = (frameRate = 0) => {
      order.push(`stream:${frameRate}`)
      box.fps.push(frameRate)
      return { getVideoTracks: () => [box.track] }
    }
    box.video.play = () => {
      order.push('play')
      return Promise.resolve()
    }
    let requested = false
    box.video.requestPictureInPicture = () => {
      requested = true
      order.push('pip')
      return Promise.resolve()
    }
    const phase = createPipController().enter(box.ports)
    expect(requested).toBe(true)
    expect(phase).toBe('open')
    expect(order).toEqual(['stream:0', 'play', 'pip'])
    expect(box.video.muted).toBe(true)
    expect(box.video.volume).toBe(0)
    expect(box.video.autoplay).toBe(false)
    expect(box.video.srcObject).not.toBeNull()
  })

  it('关闭、缺少 API、没有画布、捕获失败时都不开流，也不抛', () => {
    const off = harness({ disabled: true })
    expect(createPipController().enter(off.ports)).toBe('idle')
    expect(off.fps).toEqual([])

    const missing = harness()
    missing.video.requestPictureInPicture = undefined
    expect(createPipController().enter(missing.ports)).toBe('idle')
    expect(missing.fps).toEqual([])

    const unsupported = harness({ supported: false })
    expect(createPipController().enter(unsupported.ports)).toBe('idle')
    expect(unsupported.fps).toEqual([])

    const blank = harness({ width: 0 })
    expect(createPipController().enter(blank.ports)).toBe('idle')
    expect(blank.fps).toEqual([])

    const detached = harness({ connected: false })
    expect(createPipController().enter(detached.ports)).toBe('idle')
    expect(detached.fps).toEqual([])

    const thrown = harness()
    thrown.canvas.captureStream = () => {
      throw new Error('denied')
    }
    expect(() => createPipController().enter(thrown.ports)).not.toThrow()
    expect(createPipController().enter(thrown.ports)).toBe('idle')

    const rejected = harness({
      request: () => {
        throw new Error('no-gesture')
      },
    })
    const controller = createPipController()
    expect(controller.enter(rejected.ports)).toBe('idle')
    expect(controller.phase()).toBe('idle')
    expect(rejected.track.stopped).toBe(true)
    expect(rejected.video.srcObject).toBeNull()
  })

  it('requestPictureInPicture 被拒绝后停流，回到空闲', async () => {
    const box = harness({
      request: () => Promise.reject(new Error('no-gesture')),
    })
    const controller = createPipController()
    expect(controller.enter(box.ports)).toBe('open')
    await flush()
    expect(controller.phase()).toBe('idle')
    expect(box.track.stopped).toBe(true)
    expect(box.video.srcObject).toBeNull()
    expect(box.queued).toEqual([])
  })

  it('再点一次或浏览器关掉画中画都会停流，主视图不再被捕获', () => {
    const box = harness()
    const controller = createPipController()
    expect(controller.enter(box.ports)).toBe('open')
    box.ports.activeElement = box.video
    expect(controller.enter(box.ports)).toBe('idle')
    expect(box.exitCalls).toBe(1)
    expect(controller.phase()).toBe('idle')
    expect(box.track.stopped).toBe(true)
    expect(box.video.srcObject).toBeNull()

    const live = harness()
    const watching = createPipController()
    watching.enter(live.ports)
    expect(live.track.stopped).toBe(false)
    live.fireLeave()
    expect(watching.phase()).toBe('idle')
    expect(live.track.stopped).toBe(true)
    expect(live.video.srcObject).toBeNull()
  })

  it('退出接口拒绝时也不抛，流已经停', async () => {
    const box = harness()
    box.ports.exitPictureInPicture = () => Promise.reject(new Error('no-gesture'))
    const controller = createPipController()
    controller.enter(box.ports)
    box.ports.activeElement = box.video
    expect(() => controller.exit(box.ports)).not.toThrow()
    await flush()
    expect(controller.phase()).toBe('idle')
    expect(box.track.stopped).toBe(true)
  })

  it('没有 requestFrame 时退回 2fps，并停掉 0fps 那条', () => {
    const box = harness({ requestFrame: false })
    const controller = createPipController()
    expect(controller.enter(box.ports)).toBe('open')
    expect(box.fps).toEqual([0, PIP_FALLBACK_FPS])
    expect(PIP_FALLBACK_FPS).toBe(2)
    expect(box.fps).not.toContain(30)
  })
})

describe('demand 最小续帧', () => {
  it('开着时按 500ms 补一帧，退出后不再踢帧，也不改成 always', () => {
    expect(PIP_CONTINUE_MS).toBe(500)
    const box = harness()
    const modes: string[] = []
    const controller = createPipController()
    controller.enter(box.ports)
    expect(box.kicks).toBe(1)
    expect(box.track.frames).toBe(1)
    expect(box.queued).toHaveLength(1)
    box.queued[0]?.fn()
    expect(box.kicks).toBe(2)
    const late = box.queued[box.queued.length - 1]
    controller.exit(box.ports)
    expect(box.queued.find((item) => item.id === late?.id)).toBeUndefined()
    late?.fn()
    expect(box.kicks).toBe(2)
    expect(modes).toEqual([])
  })

  it('画布卸掉就停，踢帧的回调晚到也不再抓', async () => {
    const box = harness()
    const gate: { release: (() => void) | null } = { release: null }
    box.ports.kickFrame = () =>
      new Promise<void>((resolve) => {
        gate.release = resolve
      })
    const controller = createPipController()
    controller.enter(box.ports)
    const frames = box.track.frames
    controller.exit(box.ports)
    gate.release?.()
    await flush()
    expect(box.track.frames).toBe(frames)
    expect(controller.phase()).toBe('idle')

    const gone = harness()
    const watching = createPipController()
    watching.enter(gone.ports)
    gone.canvas.isConnected = false
    gone.queued[0]?.fn()
    expect(watching.phase()).toBe('idle')
    expect(gone.track.stopped).toBe(true)
  })
})

describe('画中画分包不进首屏', () => {
  it('懒挂在 dock 哈希之后，手势才进入，和全屏、录制划界', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(read('../scene/stage/cameraTransition.ts')).toMatch(/USER_CAMERA_SMOOTH_TIME = 0\.42/)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)

    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const session = read('./session.ts')
    const policy = read('./policy.ts')
    const plugin = read('../../scripts/pipPlugin.ts')
    const vite = read('../../vite.config.ts')
    const scene = read('../components/Scene.tsx')
    const fullscreen = read('../viewmarks/fullscreen.ts')
    const clip = read('../capture/clipSession.ts')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }

    expect(dock).toContain(PIP_SOURCE_BLOCK)
    expect(dock).toMatch(/import\('\.\.\/pip\/mount'\)/)
    expect(dock).toMatch(/mountPipWatch\(\)/)
    expect(dock).not.toMatch(/from '\.\.\/pip\/mount'/)
    const stripped = dock.replace(PIP_SOURCE_BLOCK, '')
    expect(stripped).not.toMatch(/mountPipWatch|pip\/mount|nopip|PipWatch/)
    expect(stripped).toMatch(/mountClipCapture\(\)\n\}\)\n\/\/ T059/)
    expect(plugin).toContain(PIP_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'pip-watch-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/PipWatch\.js/)
    expect(vite).toMatch(/pipAfterHash/)

    expect(mount).toMatch(/addEventListener\('click', onClick\)/)
    expect(mount).toMatch(/pagehide/)
    expect(mount).not.toMatch(/visibilitychange|fullscreenchange|requestFullscreen|exitFullscreen|nofullscreen/)
    expect(mount).not.toMatch(/\.requestPictureInPicture\(/)
    expect(mount).not.toMatch(/await import|setFrameloop|MediaRecorder|autoPictureInPicture|console\./)
    const enterAt = mount.indexOf('controller.enter')
    expect(enterAt).toBeGreaterThan(mount.indexOf('function onClick'))
    expect(enterAt).toBeLessThan(mount.indexOf('function ensureButton'))
    expect(mount.match(/controller\.enter/g)).toEqual(['controller.enter'])

    expect(session).toMatch(/captureStream\(0\)/)
    expect(session).toMatch(/requestPictureInPicture\(\)/)
    expect(session).toMatch(/PIP_CONTINUE_MS/)
    expect(session).toMatch(/PIP_FALLBACK_FPS/)
    expect(session).not.toMatch(/setFrameloop|requestAnimationFrame|MediaRecorder|requestFullscreen|autoPictureInPicture|console\./)
    expect(policy).toMatch(/nopip/)
    expect(policy).not.toMatch(/nofullscreen|requestFullscreen|setFrameloop|console\./)

    const blob = [mount, session, policy].join('\n')
    expect(blob).not.toMatch(/from ['"][^'"]*(capture\/|fullscreen|fog|cameraTransition|balancedFx|three|zustand|postprocessing)/)
    expect(blob).not.toMatch(/ccapture|Reflector|transmission|Vignette|ssgi|pathtracer|jsdelivr|FloorBadges|FogExp2/i)
    expect(fullscreen).not.toMatch(/pictureInPicture|nopip|captureStream|mountPipWatch/)
    expect(clip).not.toMatch(/pictureInPicture|nopip|mountPipWatch/)
    expect(scene).toMatch(/frameloop="demand"/)
    expect(scene).not.toMatch(/mountPipWatch|requestPictureInPicture|nopip/)

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
      '../capture/clipPolicy.ts',
      '../capture/mountClip.ts',
    ]
    for (const file of eager) {
      expect(read(file), file).not.toMatch(/mountPipWatch|PipWatch|nopip|requestPictureInPicture/)
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
    expect(mountPipWatch).toBeTypeOf('function')
    expect(() => mountPipWatch()).not.toThrow()
  })
})
