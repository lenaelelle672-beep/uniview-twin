import { deviceTypeLabel } from '../../alarms/labels'
import { searchWorkstations } from '../../locate/search'
import { useTwinStore } from '../../store/store'
import { workstationPosition } from '../stage/workstationPosition'
import type { RoomLabel } from '../stage/roomLabels'

const PRINTER_NAME = /打印|文印|复印/

export function nearestRoomLabel(labels: readonly RoomLabel[], x: number, z: number): RoomLabel | undefined {
  let best: RoomLabel | undefined
  let bestDist = Infinity
  for (const label of labels) {
    const dx = label.anchor[0] - x
    const dz = label.anchor[2] - z
    const dist = dx * dx + dz * dz
    if (dist < bestDist) {
      bestDist = dist
      best = label
    }
  }
  return best
}

function labelNearDesk(floorId: string, labels: readonly RoomLabel[], deskId: string): RoomLabel | undefined {
  try {
    const place = workstationPosition(floorId, deskId)
    return nearestRoomLabel(labels, place.x, place.z)
  } catch {
    return undefined
  }
}

function add(picked: Map<string, RoomLabel>, label?: RoomLabel) {
  if (label) picked.set(label.id, label)
}

function addNameMatches(labels: readonly RoomLabel[], needle: string | RegExp, picked: Map<string, RoomLabel>) {
  if (!needle) return
  if (typeof needle === 'string') {
    const q = needle.toLowerCase()
    if (!q) return
    for (const label of labels) {
      if (label.text.toLowerCase().includes(q)) picked.set(label.id, label)
    }
    return
  }
  for (const label of labels) {
    if (needle.test(label.text)) picked.set(label.id, label)
  }
}

/**
 * 告警 / 选中 / 搜索命中的目标标签。只决定「先挂谁」，不改显隐或透明度。
 */
export function pickPriorityLabels(floorId: string, labels: readonly RoomLabel[]): RoomLabel[] {
  const state = useTwinStore.getState()
  const picked = new Map<string, RoomLabel>()

  if (state.focusedDeskId) {
    add(picked, labelNearDesk(floorId, labels, state.focusedDeskId))
  }

  const focusedDevice = state.focusedDeviceId
    ? state.devices.find((device) => device.id === state.focusedDeviceId)
    : undefined
  if (focusedDevice && focusedDevice.floorId === floorId) {
    if (focusedDevice.deskId) add(picked, labelNearDesk(floorId, labels, focusedDevice.deskId))
    addNameMatches(labels, deviceTypeLabel(focusedDevice.type), picked)
    if (focusedDevice.type === 'printer') addNameMatches(labels, PRINTER_NAME, picked)
  }

  const query = state.searchQuery.trim()
  if (query) {
    addNameMatches(labels, query, picked)
    try {
      const hits = searchWorkstations({ desks: state.desks, people: state.people }, query, 10)
      for (const hit of hits) {
        if (hit.floorId !== floorId) continue
        add(picked, labelNearDesk(floorId, labels, hit.deskId))
      }
    } catch {
      // 图纸未就绪时仍保留文案命中
    }
  }

  return labels.filter((label) => picked.has(label.id))
}
