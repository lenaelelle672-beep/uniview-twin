/**
 * T083：canvas.captureStream → 静默 video → requestPictureInPicture。
 * 旁路 T062 的录制器和常开帧循环，只复用 captureStream(0) + requestFrame。
 * 必须在用户手势里同步走到 requestPictureInPicture。失败把流停掉，不向外抛。
 * 不调用全屏 API，也不改 frameloop。
 */
import { applySilentVideo, PIP_CONTINUE_MS, PIP_FALLBACK_FPS } from './policy'

export interface PipTrack {
  requestFrame?: () => void
  stop?: () => void
}

export interface PipStream {
  getVideoTracks: () => PipTrack[]
}

export interface PipCanvas {
  width: number
  height: number
  captureStream: (frameRate?: number) => PipStream
  isConnected?: boolean
}

export interface PipVideo {
  muted: boolean
  volume: number
  controls: boolean
  autoplay: boolean
  playsInline: boolean
  disablePictureInPicture: boolean
  srcObject: PipStream | null
  play: () => Promise<void> | void
  pause: () => void
  requestPictureInPicture?: () => Promise<unknown>
  addEventListener: (type: 'leavepictureinpicture' | 'error', listener: () => void) => void
  removeEventListener: (type: 'leavepictureinpicture' | 'error', listener: () => void) => void
}

export type PipPhase = 'idle' | 'open'

export interface PipPorts {
  disabled: boolean
  supported: boolean
  canvas: PipCanvas | null
  video: PipVideo
  /** 正在画中画里的元素。不是全屏元素。 */
  activeElement: unknown
  exitPictureInPicture?: () => Promise<void> | void
  kickFrame: () => void | Promise<void>
  schedule: (fn: () => void, ms: number) => number
  clear: (id: number) => void
  onPhase?: (phase: PipPhase) => void
}

export interface PipController {
  enter: (ports: PipPorts) => PipPhase
  exit: (ports: PipPorts) => void
  phase: () => PipPhase
}

function safeStop(track: PipTrack | undefined): void {
  try {
    track?.stop?.()
  } catch {
    // 轨道已经停了也不抛。
  }
}

function canvasLive(canvas: PipCanvas): boolean {
  return canvas.isConnected !== false && canvas.width > 0 && canvas.height > 0
}

/**
 * 优先 0fps + requestFrame，赶在 WebGL 清缓冲之前抓一帧。
 * 没有 requestFrame 再退回 2fps，不退回 30fps。
 */
function openStream(canvas: PipCanvas): { stream: PipStream; track: PipTrack } | null {
  if (!canvasLive(canvas) || typeof canvas.captureStream !== 'function') return null
  let manual: PipStream | null = null
  try {
    manual = canvas.captureStream(0)
  } catch {
    manual = null
  }
  let manualTrack: PipTrack | undefined
  try {
    manualTrack = manual?.getVideoTracks?.()[0]
  } catch {
    manualTrack = undefined
  }
  if (manual && manualTrack && typeof manualTrack.requestFrame === 'function') {
    return { stream: manual, track: manualTrack }
  }
  safeStop(manualTrack)
  try {
    const stream = canvas.captureStream(PIP_FALLBACK_FPS)
    const track = stream.getVideoTracks?.()[0]
    if (!track) return null
    return { stream, track }
  } catch {
    return null
  }
}

function stopOpened(opened: { stream: PipStream; track: PipTrack } | null): void {
  if (!opened) return
  const tracks = [opened.track]
  try {
    for (const track of opened.stream.getVideoTracks?.() ?? []) tracks.push(track)
  } catch {
    // 列不出轨道也照样停已经拿住的那条。
  }
  for (const track of tracks) safeStop(track)
}

/** demand 下按固定间隔补最少的一帧，并在画出之后再 requestFrame。退出即停。 */
function startContinue(
  ports: PipPorts,
  track: PipTrack,
  canvas: PipCanvas,
  onDead: () => void,
): () => void {
  let timer: number | null = null
  let stopped = false
  const beat = () => {
    if (stopped) return
    if (!canvasLive(canvas)) {
      onDead()
      return
    }
    try {
      track.requestFrame?.()
    } catch {
      // 这一拍抓不到就等下一拍。
    }
    let pending: void | Promise<void>
    try {
      pending = ports.kickFrame()
    } catch {
      pending = undefined
    }
    if (pending && typeof pending.then === 'function') {
      void pending.then(
        () => {
          if (stopped) return
          try {
            track.requestFrame?.()
          } catch {
            // 画完再抓一次，赶在缓冲清掉之前。
          }
        },
        () => {},
      )
    }
    try {
      timer = ports.schedule(() => {
        timer = null
        beat()
      }, PIP_CONTINUE_MS)
    } catch {
      // 没有定时器就只保留已经发出的这一帧。
    }
  }
  beat()
  return () => {
    if (stopped) return
    stopped = true
    if (timer == null) return
    const id = timer
    timer = null
    try {
      ports.clear(id)
    } catch {
      // 清掉失败也不抛。
    }
  }
}

function swallow(result: Promise<void> | void): void {
  if (result && typeof result.then === 'function') {
    void result.then(
      () => {},
      () => {},
    )
  }
}

export function createPipController(): PipController {
  let phase: PipPhase = 'idle'
  let generation = 0
  let stopPump: (() => void) | null = null
  let opened: { stream: PipStream; track: PipTrack } | null = null
  let video: PipVideo | null = null
  let leave: (() => void) | null = null

  const notify = (ports: PipPorts, next: PipPhase) => {
    try {
      ports.onPhase?.(next)
    } catch {
      // 按钮刷新失败也不抛。
    }
  }

  const teardown = (ports: PipPorts) => {
    generation += 1
    const stop = stopPump
    stopPump = null
    stop?.()
    const current = video
    const onLeave = leave
    video = null
    leave = null
    if (current && onLeave) {
      try {
        current.removeEventListener('leavepictureinpicture', onLeave)
      } catch {
        // 监听已经不在了。
      }
      try {
        current.removeEventListener('error', onLeave)
      } catch {
        // 同上。
      }
    }
    if (current) {
      try {
        current.pause()
      } catch {
        // 停不了也不抛。
      }
      current.srcObject = null
    }
    stopOpened(opened)
    opened = null
    phase = 'idle'
    notify(ports, 'idle')
  }

  const exitNow = (ports: PipPorts) => {
    if (ports.activeElement != null && ports.exitPictureInPicture) {
      try {
        swallow(ports.exitPictureInPicture())
      } catch {
        // 浏览器拒绝退出也继续拆本地的流。
      }
    }
    teardown(ports)
  }

  return {
    phase: () => phase,
    exit: (ports) => {
      try {
        exitNow(ports)
      } catch {
        try {
          teardown(ports)
        } catch {
          phase = 'idle'
        }
      }
    },
    enter: (ports) => {
      try {
        if (phase === 'open' || ports.activeElement != null) {
          exitNow(ports)
          return 'idle'
        }
        if (ports.disabled || !ports.supported) return 'idle'
        const target = ports.video
        if (!target || typeof target.requestPictureInPicture !== 'function') return 'idle'
        const canvas = ports.canvas
        if (!canvas) return 'idle'
        const next = openStream(canvas)
        if (!next) return 'idle'

        const token = ++generation
        opened = next
        video = target
        const onLeave = () => {
          if (generation !== token) return
          teardown(ports)
        }
        try {
          applySilentVideo(target)
          target.addEventListener('leavepictureinpicture', onLeave)
          target.addEventListener('error', onLeave)
          leave = onLeave
          target.srcObject = next.stream
        } catch {
          teardown(ports)
          return 'idle'
        }

        try {
          swallow(target.play())
        } catch {
          // 播不起来也继续试着进画中画，失败再拆。
        }

        let requested: Promise<unknown>
        try {
          requested = target.requestPictureInPicture()
        } catch {
          teardown(ports)
          return 'idle'
        }
        if (!requested || typeof requested.then !== 'function') {
          teardown(ports)
          return 'idle'
        }

        phase = 'open'
        stopPump = startContinue(ports, next.track, canvas, () => {
          if (generation !== token) return
          teardown(ports)
        })
        notify(ports, 'open')

        void requested.then(
          () => {
            if (generation === token) return
            if (phase !== 'idle') return
            try {
              swallow(ports.exitPictureInPicture?.())
            } catch {
              // 迟到的进入已经没人要了，退不掉也不抛。
            }
          },
          () => {
            if (generation !== token) return
            teardown(ports)
          },
        )
        return 'open'
      } catch {
        try {
          teardown(ports)
        } catch {
          phase = 'idle'
        }
        return 'idle'
      }
    },
  }
}
