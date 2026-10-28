/**
 * T082：说什么、何时说。
 * 短句只有级别和位置。节流窗里后来的告警并进同一句，不排成长队。
 * 说新的一句之前要 cancel()，静音或关掉时也 cancel()，把浏览器队列清掉。
 */

export interface SpeechFact {
  id: string
  levelText: string
  location: string
}

export interface SpeechMemory {
  heard: ReadonlySet<string>
  primed: boolean
  lastSpeakAt: number
  /** 这一句预计说到这个时刻。之前不再开口。 */
  holdUntil: number
  merged: readonly SpeechFact[]
}

export interface SpeechWatch {
  now: number
  enabled: boolean
  muted: boolean
  unlocked: boolean
  supported: boolean
  /** 提示音还占着声道。 */
  toneBusy: boolean
  facts: readonly SpeechFact[]
}

export interface SpeechDecision {
  memory: SpeechMemory
  /** 这一次要说的短句。 */
  utterance: string | null
  /** 说之前，或丢掉待播时，调用 cancel() 清队列。 */
  cancel: boolean
  /** 功能关、静音，或合成不可用。 */
  silenced: boolean
  retryInMs: number | null
  /** 语音接过声道。提示音据此让路。 */
  ownsChannel: boolean
  /** 这次说出去的那批。说失败时挂载点可以放回合并槽。 */
  batch: readonly SpeechFact[]
  holdMs: number
}

export interface SpeechAlarmRef {
  id: string
  floorId: string
  deviceId: string
}

export interface SpeechFloorRef {
  id: string
  name?: string | null
  level?: number | null
}

export interface SpeechDeviceRef {
  id: string
  deskId?: string | null
  zone?: string | null
}

export interface SpeechDeskRef {
  id: string
  zone?: string | null
}

export interface VoiceLike {
  lang: string
  name: string
  localService?: boolean
}

const ZONE_LABEL: Record<string, string> = {
  tower: '塔楼',
  podium: '裙楼',
  east: '右侧楼',
}

/** 再短也不小于这一段，避免上一句还没说完就开口。 */
export const SPEECH_MIN_HOLD_MS = 1400

export function createSpeechMemory(): SpeechMemory {
  return {
    heard: new Set(),
    primed: false,
    lastSpeakAt: Number.NEGATIVE_INFINITY,
    holdUntil: 0,
    merged: [],
  }
}

export function levelTextFromFloor(floorId: string, name?: string | null, level?: number | null): string {
  if (name && name.trim()) return name.trim()
  if (floorId === 'B1' || level === -1) return '地下一层'
  const parsed = level != null && Number.isFinite(level) ? level : Number(floorId.replace(/^[A-Za-z]+/, ''))
  if (parsed === 1) return '一层'
  if (Number.isFinite(parsed)) return `${parsed} 层`
  return floorId
}

export function locationText(zone: string | null | undefined, deskId: string | null | undefined, deviceId: string): string {
  const zoneLabel = zone ? (ZONE_LABEL[zone] ?? '') : ''
  if (deskId) return zoneLabel ? `${zoneLabel} ${deskId}` : deskId
  if (zoneLabel) return zoneLabel
  return deviceId
}

export function speechFacts(source: {
  alarms: readonly SpeechAlarmRef[]
  floors: readonly SpeechFloorRef[]
  devices: readonly SpeechDeviceRef[]
  desks: readonly SpeechDeskRef[]
}): SpeechFact[] {
  const floors = new Map(source.floors.map((floor) => [floor.id, floor]))
  const devices = new Map(source.devices.map((device) => [device.id, device]))
  const desks = new Map(source.desks.map((desk) => [desk.id, desk]))
  const facts: SpeechFact[] = []
  for (const alarm of source.alarms) {
    if (!alarm.id) continue
    const floor = floors.get(alarm.floorId)
    const device = devices.get(alarm.deviceId)
    const desk = device?.deskId ? desks.get(device.deskId) : undefined
    const zone = desk?.zone ?? device?.zone ?? null
    facts.push({
      id: alarm.id,
      levelText: levelTextFromFloor(alarm.floorId, floor?.name, floor?.level),
      location: locationText(zone, device?.deskId ?? null, alarm.deviceId),
    })
  }
  return facts
}

/** 一句。多条时只报最新一条的级别和位置，再带上其余条数。 */
export function utteranceFor(facts: readonly SpeechFact[]): string | null {
  if (facts.length === 0) return null
  const last = facts[facts.length - 1]
  if (!last) return null
  if (facts.length === 1) return `告警，${last.levelText}，${last.location}`
  return `告警，${last.levelText}，${last.location}，另${facts.length - 1}处`
}

export function utteranceHoldMs(text: string): number {
  return Math.min(7000, Math.max(SPEECH_MIN_HOLD_MS, text.length * 240))
}

function chineseVoiceRank(voice: VoiceLike): number | null {
  const lang = voice.lang.toLowerCase().replace(/_/g, '-')
  const name = voice.name.toLowerCase()
  const chinese = lang.startsWith('zh') || /chinese|中文|普通话|汉语/.test(name)
  if (!chinese) return null
  const remote = voice.localService === false ? 1 : 0
  if (lang === 'zh-cn' || lang.startsWith('zh-cn')) return remote
  if (lang.startsWith('zh-hans')) return 2
  if (lang.startsWith('zh')) return 3
  return 4
}

/** 有中文语音就用。zh-CN 优先。没有就返回 null，调用方仍把 lang 设成 zh-CN。 */
export function preferChineseVoice<T extends VoiceLike>(voices: readonly T[]): T | null {
  let best: T | null = null
  let bestRank = Number.POSITIVE_INFINITY
  for (const voice of voices) {
    const rank = chineseVoiceRank(voice)
    if (rank == null || rank >= bestRank) continue
    best = voice
    bestRank = rank
  }
  return best
}

/** 清掉浏览器里排队的 utterance。静音、关掉、说新的一句之前都走这里。 */
export function clearSpeechQueue(synth: { cancel?: () => void } | null | undefined): void {
  if (!synth || typeof synth.cancel !== 'function') return
  try {
    synth.cancel()
  } catch {
    // 队列已经空
  }
}

function emptyDecision(memory: SpeechMemory, extra: Partial<SpeechDecision> = {}): SpeechDecision {
  return {
    memory,
    utterance: null,
    cancel: false,
    silenced: false,
    retryInMs: null,
    ownsChannel: false,
    batch: [],
    holdMs: 0,
    ...extra,
  }
}

export function watchSpeech(memory: SpeechMemory, watch: SpeechWatch): SpeechDecision {
  const heard = new Set(memory.heard)
  const fresh: SpeechFact[] = []
  for (const fact of watch.facts) {
    if (!fact.id || heard.has(fact.id)) continue
    heard.add(fact.id)
    fresh.push(fact)
  }

  const ownsChannel = watch.enabled && !watch.muted && watch.supported
  const silenced = !ownsChannel
  const base = {
    heard,
    primed: true,
    lastSpeakAt: memory.lastSpeakAt,
    holdUntil: memory.holdUntil,
  }

  if (!memory.primed) {
    return emptyDecision(
      {
        ...base,
        merged: ownsChannel && !watch.unlocked ? fresh : [],
      },
      { silenced, ownsChannel },
    )
  }

  if (silenced) {
    return emptyDecision(
      { ...base, merged: [] },
      { cancel: memory.merged.length > 0, silenced: true, ownsChannel: false },
    )
  }

  const merged = [...memory.merged, ...fresh]
  if (!watch.unlocked || merged.length === 0) {
    return emptyDecision({ ...base, merged }, { ownsChannel })
  }

  const waitMs = memory.holdUntil - watch.now
  if (watch.toneBusy || waitMs > 0) {
    const retryInMs = watch.toneBusy ? Math.max(280, waitMs > 0 ? waitMs : 0) : waitMs
    return emptyDecision({ ...base, merged }, { retryInMs, ownsChannel })
  }

  const utterance = utteranceFor(merged)
  const holdMs = utterance ? utteranceHoldMs(utterance) : 0
  return {
    memory: {
      heard,
      primed: true,
      lastSpeakAt: watch.now,
      holdUntil: watch.now + holdMs,
      merged: [],
    },
    utterance,
    cancel: true,
    silenced: false,
    retryInMs: null,
    ownsChannel,
    batch: merged,
    holdMs,
  }
}
