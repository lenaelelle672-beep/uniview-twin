/**
 * T062：canvas.captureStream + MediaRecorder。
 * 开录必须在用户手势里同步走到 start()。禁录（没有画布、没有 webm、API 抛错）不向外抛。
 */
import {
  CLIP_FILENAME,
  clipBlob,
  clipStopAt,
  holdContinuousFrameloop,
  type ClipFrameloop,
} from './clipPolicy'

const CLIP_TIMESLICE_MS = 500

export interface ClipStreamTrack {
  requestFrame?: () => void
  stop?: () => void
}

export interface ClipStream {
  getVideoTracks: () => ClipStreamTrack[]
}

export interface ClipCanvas {
  width: number
  height: number
  captureStream: (frameRate?: number) => ClipStream
  isConnected?: boolean
}

export interface ClipRecorderEvent {
  data?: Blob
}

export interface ClipRecorder {
  state: string
  start: (timeslice?: number) => void
  stop: () => void
  addEventListener: (type: 'dataavailable' | 'stop' | 'error', listener: (event: ClipRecorderEvent) => void) => void
}

export type ClipPhase = 'idle' | 'recording'

export interface ClipPorts {
  canvas: ClipCanvas | null
  frameloop: ClipFrameloop | null
  now: () => number
  mime: string | null
  createRecorder: (stream: ClipStream, mime: string) => ClipRecorder
  download: (blob: Blob, filename: string) => void
  kickFrame: () => void | Promise<void>
  raf: (fn: () => void) => void
  schedule: (fn: () => void, ms: number) => number
  clear: (id: number) => void
  onPhase?: (phase: ClipPhase) => void
}

export interface ClipController {
  toggle: (ports: ClipPorts) => ClipPhase
  phase: () => ClipPhase
}

function safeStopTrack(track: ClipStreamTrack | undefined): void {
  try {
    track?.stop?.()
  } catch {
    // 轨道已经停了也不抛。
  }
}

function canvasLive(canvas: ClipCanvas): boolean {
  return canvas.isConnected !== false && canvas.width > 0 && canvas.height > 0
}

/** 优先 0fps + requestFrame，赶在 WebGL 清缓冲之前抓帧。没有 requestFrame 再退回 30fps。 */
function openStream(canvas: ClipCanvas): { stream: ClipStream; track: ClipStreamTrack } | null {
  if (!canvasLive(canvas) || typeof canvas.captureStream !== 'function') return null
  let manual: ClipStream | null = null
  try {
    manual = canvas.captureStream(0)
  } catch {
    manual = null
  }
  let manualTrack: ClipStreamTrack | undefined
  try {
    manualTrack = manual?.getVideoTracks?.()[0]
  } catch {
    manualTrack = undefined
  }
  if (manual && manualTrack && typeof manualTrack.requestFrame === 'function') {
    return { stream: manual, track: manualTrack }
  }
  safeStopTrack(manualTrack)
  try {
    const stream = canvas.captureStream(30)
    const track = stream.getVideoTracks?.()[0]
    if (!track) return null
    return { stream, track }
  } catch {
    return null
  }
}

interface LiveSession {
  requestStop: () => void
}

function openSession(ports: ClipPorts, onIdle: () => void): LiveSession | null {
  const mime = ports.mime
  const canvas = ports.canvas
  if (!mime || !canvas) return null
  const opened = openStream(canvas)
  if (!opened) return null

  let recorder: ClipRecorder
  try {
    recorder = ports.createRecorder(opened.stream, mime)
  } catch {
    safeStopTrack(opened.track)
    return null
  }

  const restore = holdContinuousFrameloop(ports.frameloop)
  try {
    recorder.start(CLIP_TIMESLICE_MS)
  } catch {
    restore()
    safeStopTrack(opened.track)
    return null
  }

  const chunks: Blob[] = []
  let finished = false
  let pumpOn = true
  let timer: number | null = null
  let stopRequested = false
  const startedAt = ports.now()

  const clearTimer = () => {
    if (timer == null) return
    try {
      ports.clear(timer)
    } catch {
      // 清定时器失败也不抛。
    }
    timer = null
  }

  const finish = () => {
    if (finished) return
    finished = true
    pumpOn = false
    clearTimer()
    restore()
    try {
      if (recorder.state === 'recording') recorder.stop()
      else safeStopTrack(opened.track)
    } catch {
      safeStopTrack(opened.track)
    }
    onIdle()
    try {
      ports.onPhase?.('idle')
    } catch {
      // 按钮刷新失败也不抛。
    }
  }

  const arm = (ms: number) => {
    clearTimer()
    try {
      timer = ports.schedule(() => {
        timer = null
        finish()
      }, Math.max(0, ms))
    } catch {
      finish()
    }
  }

  const requestStop = () => {
    if (finished || stopRequested) return
    stopRequested = true
    const due = clipStopAt(startedAt, ports.now(), true)
    const wait = due - ports.now()
    if (wait <= 0) finish()
    else arm(wait)
  }

  const grab = () => {
    if (!pumpOn) return
    if (!canvasLive(canvas)) {
      finish()
      return
    }
    try {
      opened.track.requestFrame?.()
    } catch {
      // requestFrame 不可用时，always 循环仍会往 captureStream 送帧。
    }
    if (!pumpOn) return
    try {
      ports.raf(pump)
    } catch {
      // 泵不了就只靠已经打开的 frameloop。
    }
  }

  function pump() {
    if (!pumpOn) return
    let settled = false
    let fallback: number | null = null
    const once = () => {
      if (fallback != null) {
        const id = fallback
        fallback = null
        try {
          ports.clear(id)
        } catch {
          // 定时器已经触发过。
        }
      }
      if (settled || !pumpOn) return
      settled = true
      grab()
    }
    let pending: void | Promise<void>
    try {
      pending = ports.kickFrame()
    } catch {
      pending = undefined
    }
    if (pending && typeof pending.then === 'function') {
      void pending.then(once, once)
      // 画完钩子如果没有回来，仍然按短间隔抓帧，避免整段录成空文件。
      try {
        fallback = ports.schedule(once, 50)
      } catch {
        // 没有定时器就只等这一帧的钩子。
      }
      return
    }
    try {
      ports.raf(once)
    } catch {
      // 下一帧排不上也不中断录制。
    }
  }

  try {
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data)
    })
    recorder.addEventListener('stop', () => {
      safeStopTrack(opened.track)
      const blob = clipBlob(chunks, mime)
      if (!blob) return
      try {
        ports.download(blob, CLIP_FILENAME)
      } catch {
        // 下载失败不抛。
      }
    })
    recorder.addEventListener('error', () => {
      finish()
    })
    arm(clipStopAt(startedAt, startedAt, false) - startedAt)
    if (finished) return null
    ports.raf(pump)
  } catch {
    if (!finished) finish()
    return null
  }
  if (finished) return null

  return { requestStop }
}

function releaseFrameloop(ports: ClipPorts): void {
  const state = ports.frameloop
  if (!state || typeof state.setFrameloop !== 'function') return
  const clock = state.clock
  const held = clock?.elapsedTime
  try {
    state.setFrameloop('demand')
  } catch {
    // 禁录路径不抛。
  }
  if (clock && typeof held === 'number') clock.elapsedTime = held
}

export function createClipController(): ClipController {
  let phase: ClipPhase = 'idle'
  let live: LiveSession | null = null

  return {
    phase: () => phase,
    toggle: (ports) => {
      try {
        if (live) {
          live.requestStop()
          return phase
        }
        const session = openSession(ports, () => {
          live = null
          phase = 'idle'
        })
        if (!session) {
          phase = 'idle'
          return 'idle'
        }
        live = session
        phase = 'recording'
        try {
          ports.onPhase?.('recording')
        } catch {
          // 忽略按钮通知。
        }
        return 'recording'
      } catch {
        live = null
        phase = 'idle'
        if (ports.frameloop?.frameloop === 'always') releaseFrameloop(ports)
        return 'idle'
      }
    },
  }
}
