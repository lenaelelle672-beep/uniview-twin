/**
 * T082 × T054：告警声道门闩。
 * 两个晚加载分包各打一份这份逻辑，状态挂在 globalThis 上，所以仍是同一把锁。
 * 语音接过声道时提示音让出；语音正在说时提示音也不抢。
 */

export type AlarmChannel = 'tone' | 'speech'

export interface AlarmChannelState {
  speechOwns: boolean
  holder: AlarmChannel | null
  until: number
}

const KEY = '__twinAlarmChannel'

function cell(): AlarmChannelState {
  const host = globalThis as typeof globalThis & { [KEY]?: AlarmChannelState }
  const current = host[KEY]
  if (current) return current
  const created: AlarmChannelState = { speechOwns: false, holder: null, until: 0 }
  host[KEY] = created
  return created
}

export function resetAlarmChannelForTests(): void {
  const host = globalThis as typeof globalThis & { [KEY]?: AlarmChannelState }
  host[KEY] = { speechOwns: false, holder: null, until: 0 }
}

export function readAlarmChannel(): AlarmChannelState {
  const current = cell()
  return { speechOwns: current.speechOwns, holder: current.holder, until: current.until }
}

/** 语音功能打开且未静音时为真。提示音看到后不再出声。 */
export function setSpeechOwns(owns: boolean): void {
  const current = cell()
  current.speechOwns = owns
  if (!owns && current.holder === 'speech') {
    current.holder = null
    current.until = 0
  }
}

export function speechOwnsChannel(): boolean {
  return cell().speechOwns
}

/** 占着声道的一方。到点就放开。 */
export function channelBusy(now: number): AlarmChannel | null {
  const current = cell()
  if (current.holder == null) return null
  if (now < current.until) return current.holder
  current.holder = null
  current.until = 0
  return null
}

/** 对方还占着时返回 false。同一方可以续上自己的占用。 */
export function acquireChannel(owner: AlarmChannel, now: number, holdMs: number): boolean {
  const busy = channelBusy(now)
  if (busy && busy !== owner) return false
  const current = cell()
  current.holder = owner
  current.until = now + Math.max(0, holdMs)
  return true
}

export function releaseChannel(owner: AlarmChannel): void {
  const current = cell()
  if (current.holder !== owner) return
  current.holder = null
  current.until = 0
}

/**
 * 提示音这一下怎么处理。
 * yield：语音接过了，不响，也不补响。
 * wait：语音还在说，过一会儿再试。
 * play：声道空着，可以响。
 */
export function decideToneOutput(now: number): 'yield' | 'wait' | 'play' {
  if (speechOwnsChannel()) return 'yield'
  if (channelBusy(now) === 'speech') return 'wait'
  return 'play'
}
