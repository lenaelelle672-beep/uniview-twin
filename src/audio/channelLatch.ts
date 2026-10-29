/**
 * T082 × T054 × T084：告警声道门闩。
 * 几个晚加载分包各打一份这份逻辑，状态挂在 globalThis 上，所以仍是同一把锁。
 * 语音接过声道时提示音让出；语音正在说时提示音也不抢。
 * 桌面通知已允许时，文档 hidden 这一阵由通知接手，提示音和语音都不再出声。
 */

export type AlarmChannel = 'tone' | 'speech' | 'notify'

export interface AlarmChannelState {
  speechOwns: boolean
  /** 桌面通知开着且已经允许。是否接手还要再看文档是不是 hidden。 */
  notifyCovers: boolean
  holder: AlarmChannel | null
  until: number
}

const KEY = '__twinAlarmChannel'

function cell(): AlarmChannelState {
  const host = globalThis as typeof globalThis & { [KEY]?: AlarmChannelState }
  const current = host[KEY]
  if (current) return current
  const created: AlarmChannelState = { speechOwns: false, notifyCovers: false, holder: null, until: 0 }
  host[KEY] = created
  return created
}

export function resetAlarmChannelForTests(): void {
  const host = globalThis as typeof globalThis & { [KEY]?: AlarmChannelState }
  host[KEY] = { speechOwns: false, notifyCovers: false, holder: null, until: 0 }
}

export function readAlarmChannel(): AlarmChannelState {
  const current = cell()
  return {
    speechOwns: current.speechOwns,
    notifyCovers: current.notifyCovers === true,
    holder: current.holder,
    until: current.until,
  }
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

/** 桌面通知开着且浏览器已经允许。关功能或权限不够时关掉。 */
export function setNotifyCovers(covers: boolean): void {
  const current = cell()
  current.notifyCovers = covers
  if (!covers && current.holder === 'notify') {
    current.holder = null
    current.until = 0
  }
}

/** 文档藏在后台，并且桌面通知会负责这一次。看得见页面时为假。 */
export function notifyCoversHidden(): boolean {
  if (!cell().notifyCovers) return false
  try {
    return typeof document !== 'undefined' && document.hidden === true
  } catch {
    return false
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
 * yield：语音或桌面通知接过了，不响，也不补响。
 * wait：语音还在说，或通知还占着，过一会儿再试。
 * play：声道空着，可以响。
 */
export function decideToneOutput(now: number): 'yield' | 'wait' | 'play' {
  if (notifyCoversHidden()) return 'yield'
  if (speechOwnsChannel()) return 'yield'
  const busy = channelBusy(now)
  if (busy === 'speech' || busy === 'notify') return 'wait'
  return 'play'
}
