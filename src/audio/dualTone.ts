/**
 * 150–300ms 双音。两只 OscillatorNode 先后接到同一只 GainNode，
 * 不下载音频文件，也不引入额外音频库。
 */
export const CUE_DURATION_MS = 240

export const CUE_DURATION_SEC = CUE_DURATION_MS / 1000

export const FIRST_TONE_HZ = 880

export const SECOND_TONE_HZ = 1320

const ATTACK_SEC = 0.012
const FIRST_END_SEC = 0.12
const SECOND_START_SEC = 0.1
const PEAK_GAIN = 0.12

export interface CueToneNode {
  type: string
  frequency: { setValueAtTime: (value: number, time: number) => void }
  connect: (node: unknown) => void
  start: (when: number) => void
  stop: (when: number) => void
  onended: (() => void) | null
  disconnect: () => void
}

export interface CueGainNode {
  gain: {
    setValueAtTime: (value: number, time: number) => void
    exponentialRampToValueAtTime: (value: number, time: number) => void
  }
  connect: (node: unknown) => void
  disconnect: () => void
}

export interface CueAudioContext {
  state: string
  currentTime: number
  destination: unknown
  createOscillator: () => CueToneNode
  createGain: () => CueGainNode
  resume?: () => Promise<void>
}

export function scheduleDualTone(ctx: CueAudioContext, when = ctx.currentTime): void {
  const master = ctx.createGain()
  master.gain.setValueAtTime(0.0001, when)
  master.gain.exponentialRampToValueAtTime(PEAK_GAIN, when + ATTACK_SEC)
  master.gain.exponentialRampToValueAtTime(0.0001, when + CUE_DURATION_SEC)
  master.connect(ctx.destination)

  let open = 2
  const release = () => {
    open -= 1
    if (open > 0) return
    try {
      master.disconnect()
    } catch {
      // 节点已经离开图
    }
  }

  const voice = (frequency: number, start: number, end: number) => {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(frequency, start)
    osc.connect(master)
    osc.onended = release
    osc.start(start)
    osc.stop(end)
  }

  voice(FIRST_TONE_HZ, when, when + FIRST_END_SEC)
  voice(SECOND_TONE_HZ, when + SECOND_START_SEC, when + CUE_DURATION_SEC)
}

/** 未解锁或上下文已关闭时返回 false，不抛错。 */
export function playAlarmCue(ctx: CueAudioContext | null): boolean {
  if (!ctx || ctx.state !== 'running') return false
  try {
    scheduleDualTone(ctx, ctx.currentTime)
    return true
  } catch {
    return false
  }
}

/** 手势之后再 resume。调用本身和被拒绝的 Promise 都不向外抛。 */
export function resumeCueContext(ctx: CueAudioContext | null): Promise<void> {
  if (!ctx || ctx.state !== 'suspended' || typeof ctx.resume !== 'function') return Promise.resolve()
  try {
    return Promise.resolve(ctx.resume()).then(
      () => undefined,
      () => undefined,
    )
  } catch {
    return Promise.resolve()
  }
}

export function openCueContext(create: () => CueAudioContext = defaultAudioContext): CueAudioContext | null {
  try {
    return create()
  } catch {
    return null
  }
}

function defaultAudioContext(): CueAudioContext {
  if (typeof window === 'undefined') throw new Error('no-window')
  const host = window as Window & { webkitAudioContext?: typeof AudioContext }
  const Ctor = window.AudioContext ?? host.webkitAudioContext
  if (!Ctor) throw new Error('no-audio')
  return new Ctor() as unknown as CueAudioContext
}
