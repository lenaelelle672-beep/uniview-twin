/**
 * T084：何时弹一条桌面通知。
 * 第一份快照先记住，不补弹已经在场的告警。
 * 只在文档 hidden、功能开着、并且已经允许时弹。看得见页面时丢掉待发。
 * 节流窗里后来的告警并成下一条，不逐条刷屏。
 */

export const NOTIFY_GAP_MS = 8000

export const NOTIFY_TITLE = '告警'

export interface NotifyFact {
  id: string
  levelText: string
  location: string
}

export interface NotifyMemory {
  seen: ReadonlySet<string>
  primed: boolean
  lastFireAt: number
  pending: readonly NotifyFact[]
}

export interface NotifyWatch {
  now: number
  enabled: boolean
  /** 安全上下文里 permission === 'granted'。 */
  permitted: boolean
  hidden: boolean
  facts: readonly NotifyFact[]
}

export interface NotifyDecision {
  memory: NotifyMemory
  /** 这一次要弹出的正文。标题固定是「告警」。 */
  body: string | null
  title: string
  retryInMs: number | null
  /** 功能关，或浏览器不能弹。静默。 */
  degraded: boolean
}

export function createNotifyMemory(): NotifyMemory {
  return {
    seen: new Set(),
    primed: false,
    lastFireAt: Number.NEGATIVE_INFINITY,
    pending: [],
  }
}

/** 一条。多条时只写最新一条的级别和位置，再带上其余条数。 */
export function notifyBody(facts: readonly NotifyFact[]): string | null {
  if (facts.length === 0) return null
  const last = facts[facts.length - 1]
  if (!last) return null
  if (facts.length === 1) return `${last.levelText}，${last.location}`
  return `${last.levelText}，${last.location}，另${facts.length - 1}处`
}

function quiet(memory: NotifyMemory, degraded: boolean): NotifyDecision {
  return {
    memory,
    body: null,
    title: NOTIFY_TITLE,
    retryInMs: null,
    degraded,
  }
}

export function watchNotify(memory: NotifyMemory, watch: NotifyWatch): NotifyDecision {
  const seen = new Set(memory.seen)
  const fresh: NotifyFact[] = []
  for (const fact of watch.facts) {
    if (!fact.id || seen.has(fact.id)) continue
    seen.add(fact.id)
    fresh.push(fact)
  }

  const degraded = !watch.enabled || !watch.permitted
  const base = {
    seen,
    primed: true,
    lastFireAt: memory.lastFireAt,
  }

  if (!memory.primed) {
    return quiet({ ...base, pending: [] }, degraded)
  }

  if (degraded || !watch.hidden) {
    return quiet({ ...base, pending: [] }, degraded)
  }

  const pending = [...memory.pending, ...fresh]
  if (pending.length === 0) return quiet({ ...base, pending }, false)

  const wait = memory.lastFireAt + NOTIFY_GAP_MS - watch.now
  if (Number.isFinite(memory.lastFireAt) && wait > 0) {
    return {
      memory: { ...base, pending },
      body: null,
      title: NOTIFY_TITLE,
      retryInMs: wait,
      degraded: false,
    }
  }

  return {
    memory: {
      seen,
      primed: true,
      lastFireAt: watch.now,
      pending: [],
    },
    body: notifyBody(pending),
    title: NOTIFY_TITLE,
    retryInMs: null,
    degraded: false,
  }
}
