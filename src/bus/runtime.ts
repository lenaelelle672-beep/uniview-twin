/**
 * T081：BroadcastChannel 会话。
 * 本地写入只在白名单变化时发出一条消息。应用远端消息时不再转发，并按 id 丢掉环回。
 * 关掉或拆掉时 close()。
 */

import {
  BUS_CHANNEL,
  diffWhitelist,
  parseWire,
  rememberId,
  type BusBody,
  type BusSnapshot,
} from './policy'

export interface BusChannel {
  postMessage(data: unknown): void
  onmessage: ((event: { data: unknown }) => void) | null
  close(): void
}

export interface BusProbe {
  on: boolean
  channel: typeof BUS_CHANNEL
  tab: string
  sent: number
  applied: number
  dropped: number
  closed: boolean
}

export interface BusPorts {
  tabId: string
  enabled: boolean
  openChannel: (name: string) => BusChannel
  read: () => BusSnapshot
  apply: (body: BusBody) => void
  subscribe: (listener: () => void) => () => void
  loadViewpoint?: () => void | Promise<unknown>
  now?: () => number
}

export interface RunningBus {
  setEnabled(on: boolean): void
  enabled(): boolean
  close(): void
  probe(): BusProbe
}

const BURST_MAX = 8
const BURST_MS = 1000

export function startBus(ports: BusPorts): RunningBus {
  let enabled = ports.enabled
  let tornDown = false
  let channel: BusChannel | null = null
  let unsub: (() => void) | null = null
  let snapshot = ports.read()
  let seen: string[] = []
  let seq = 0
  let sent = 0
  let applied = 0
  let dropped = 0
  let applying = false
  let burst = 0
  let burstAt = 0
  const now = ports.now ?? (() => Date.now())

  function allow(): boolean {
    const time = now()
    if (time - burstAt > BURST_MS) {
      burst = 0
      burstAt = time
    }
    burst += 1
    return burst <= BURST_MAX
  }

  function post(body: BusBody): void {
    if (!enabled || !channel || tornDown) return
    if (!allow()) {
      dropped += 1
      return
    }
    seq += 1
    const id = `${ports.tabId}:${seq.toString(36)}`
    seen = rememberId(seen, id)
    sent += 1
    channel.postMessage({ v: 1, id, from: ports.tabId, ...body })
  }

  function onLocal(): void {
    const next = ports.read()
    if (applying || !enabled || tornDown || !channel) {
      snapshot = next
      return
    }
    const bodies = diffWhitelist(snapshot, next)
    snapshot = next
    for (const body of bodies) post(body)
  }

  function onMessage(event: { data: unknown }): void {
    if (!enabled || tornDown) {
      dropped += 1
      return
    }
    const parsed = parseWire(event.data, ports.tabId, seen)
    if (!parsed) {
      dropped += 1
      return
    }
    seen = rememberId(seen, parsed.id)
    applying = true
    try {
      ports.apply(parsed.body)
      if (parsed.body.t === 'vp') void ports.loadViewpoint?.()
      applied += 1
      snapshot = ports.read()
    } finally {
      applying = false
    }
  }

  function shutChannel(): void {
    unsub?.()
    unsub = null
    if (!channel) return
    channel.onmessage = null
    channel.close()
    channel = null
  }

  function listen(): void {
    if (channel || tornDown || !enabled) return
    try {
      channel = ports.openChannel(BUS_CHANNEL)
    } catch {
      enabled = false
      return
    }
    channel.onmessage = onMessage
    snapshot = ports.read()
    unsub = ports.subscribe(onLocal)
  }

  function setEnabled(on: boolean): void {
    if (tornDown || (on === enabled && Boolean(channel) === on)) return
    enabled = on
    if (!on) shutChannel()
    else listen()
  }

  function close(): void {
    if (tornDown) return
    tornDown = true
    enabled = false
    shutChannel()
  }

  if (enabled) listen()

  return {
    setEnabled,
    enabled: () => enabled && !tornDown,
    close,
    probe: () => ({
      on: enabled && !tornDown,
      channel: BUS_CHANNEL,
      tab: ports.tabId,
      sent,
      applied,
      dropped,
      closed: tornDown || channel == null,
    }),
  }
}
