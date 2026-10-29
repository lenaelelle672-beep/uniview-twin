/**
 * T086：密叠拾取轮询的开关、命中和按键。
 * 这里不 import drei，也不 import three。门闩可以进晚加载分包，CycleRaycast 仍留在另一包。
 *
 * 默认关。DEMO（作者态 / demoEdit）或密模层（style=model）才开。
 * `cycle=1` / `cycle=0` 盖过场景，本页按钮再盖过地址。
 * 默认键是 Tab（keyCode 9）。不听滚轮，避免和 CameraControls 的推拉抢文档 wheel。
 * Shift 留给 T052 框选，拖摆进行时让路，指针按下时不打断镜头。
 */

export const CYCLE_KEY_CODE = 9
export const CYCLE_SCROLL = false as const

export type CycleLayerName = 'demo' | 'dense'

export type CycleBlock = 'key' | 'repeat' | 'modifier' | 'drag' | 'box' | 'camera' | 'field' | 'away'

export interface CycleScope {
  demo: boolean
  dense: boolean
}

export interface CycleObject {
  uuid: string
  name: string
  userData?: Record<string, unknown>
  parent?: CycleObject | null
}

export interface CycleHit {
  object: CycleObject
  instanceId?: number
}

export interface CycleFocus {
  deskId: string | null
  deviceId: string | null
  instanceId: number | null
  layer: CycleLayerName
  key: string
}

export interface CycleActivity {
  dragging: boolean
  pointerDown: boolean
  boxSelecting: boolean
  pointerOnCanvas: boolean
}

export interface CycleTarget {
  tagName?: string
  isContentEditable?: boolean
  closest?: (selector: string) => unknown
}

export interface CycleKeyEvent {
  key?: string
  keyCode?: number
  which?: number
  shiftKey?: boolean
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  repeat?: boolean
  target?: CycleTarget | null
}

const WORKSTATION = /^(WorkstationDesks|WorkstationChairs|WorkstationMonitors)$/
const BLOCK_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'SUMMARY'])

export function readParam(value: string, key: string): string | null {
  if (!value) return null
  if (value.includes('://')) {
    try {
      return new URL(value).searchParams.get(key)
    } catch {
      return null
    }
  }
  const hash = value.indexOf('#')
  const before = hash >= 0 ? value.slice(0, hash) : value
  const at = before.indexOf('?')
  const query = at >= 0 ? before.slice(at + 1) : before
  return new URLSearchParams(query).get(key)
}

/** 地址上的 cycle=1 / cycle=0。其它取值不当开关。 */
export function cycleFlag(value: string): 'on' | 'off' | null {
  const flag = readParam(value, 'cycle')
  if (flag === '1') return 'on'
  if (flag === '0') return 'off'
  return null
}

/**
 * 本页按钮优先，其次当前地址，再其次启动地址。
 * 地址没写时，只有 DEMO 或密模层才开。
 */
export function cycleScopeEnabled(
  override: boolean | null,
  search: string,
  navigation: string,
  scope: CycleScope,
): boolean {
  if (override != null) return override
  const flag = cycleFlag(search) ?? cycleFlag(navigation)
  if (flag === 'on') return true
  if (flag === 'off') return false
  return scope.demo || scope.dense
}

export function hitIdentity(hit: CycleHit): string {
  const instance = hit.instanceId
  return instance == null ? hit.object.uuid : `${hit.object.uuid}#${instance}`
}

/**
 * drei 只用 object.uuid 判断命中列表变了没有，同一 InstancedMesh 的不同 instanceId 不会重置 cycle。
 * 这里把实例序号算进身份，嵌套实例不会折成同一次侧栏焦点。
 */
export function hitsChanged(prev: readonly CycleHit[], next: readonly CycleHit[]): boolean {
  if (prev.length !== next.length) return true
  for (let index = 0; index < prev.length; index += 1) {
    const left = prev[index]
    const right = next[index]
    if (!left || !right) return true
    if (hitIdentity(left) !== hitIdentity(right)) return true
  }
  return false
}

/** 对照 drei 的重置条件：只看 uuid，不看 instanceId。测试用来卡住这个坑。 */
export function uuidSetChanged(prev: readonly CycleHit[], next: readonly CycleHit[]): boolean {
  if (prev.length !== next.length) return true
  const uuids = next.map((hit) => hit.object.uuid)
  return !prev.every((hit) => uuids.includes(hit.object.uuid))
}

function seenWalk(root: CycleObject | null | undefined, visit: (node: CycleObject) => boolean): CycleObject | null {
  let current = root
  const seen = new Set<CycleObject>()
  while (current && !seen.has(current)) {
    seen.add(current)
    if (visit(current)) return current
    current = current.parent
  }
  return null
}

function excluded(object: CycleObject): boolean {
  return (
    seenWalk(object, (node) => {
      if (node.userData?.boxPickProxy === true || node.userData?.dragPlacement === true) return true
      return node.name === 'DeskPickProxy' || node.name === 'DragDevice' || node.name === 'DragFurniture' || node.name === 'PlacementDrag'
    }) != null
  )
}

function layerOf(object: CycleObject): CycleLayerName | null {
  const demo = seenWalk(object, (node) => {
    if (node.userData?.cycleLayer === 'demo' || node.userData?.demoPick === true) return true
    return node.name === 'DemoDense' || node.name === 'DemoPoints'
  })
  if (demo) return 'demo'
  const dense = seenWalk(object, (node) => {
    if (WORKSTATION.test(node.name)) return true
    if (node.userData?.cycleLayer === 'dense' || node.userData?.dense === true) return true
    return node.name === 'EastGrille' || node.name === 'CorridorPeople' || node.name === 'DenseModels'
  })
  return dense ? 'dense' : null
}

function readIds(data: Record<string, unknown> | undefined): { deskId: string | null; deviceId: string | null } {
  const deskId = typeof data?.deskId === 'string' && data.deskId ? data.deskId : null
  const deviceId = typeof data?.deviceId === 'string' && data.deviceId ? data.deviceId : null
  return { deskId, deviceId }
}

function deskFromInstance(floorId: string | null, instanceId: number | undefined): string | null {
  if (!floorId || instanceId == null || !Number.isInteger(instanceId) || instanceId < 0) return null
  return `${floorId}-${instanceId + 1}`
}

function ancestorIds(start: CycleObject | null | undefined): { deskId: string | null; deviceId: string | null } {
  let deskId: string | null = null
  let deviceId: string | null = null
  seenWalk(start, (node) => {
    const ids = readIds(node.userData)
    deskId = deskId ?? ids.deskId
    deviceId = deviceId ?? ids.deviceId
    return Boolean(deskId && deviceId)
  })
  return { deskId, deviceId }
}

function pack(hit: CycleHit, layer: CycleLayerName, deskId: string | null, deviceId: string | null): CycleFocus | null {
  if (!deskId && !deviceId) return null
  return {
    deskId,
    deviceId,
    instanceId: hit.instanceId ?? null,
    layer,
    key: hitIdentity(hit),
  }
}

/** 当前 cycle 下这一击该把侧栏指到哪。框选代理和拖摆手柄返回 null。 */
export function focusOfHit(hit: CycleHit, floorId: string | null): CycleFocus | null {
  if (excluded(hit.object)) return null
  const layer = layerOf(hit.object)
  if (!layer) return null
  const own = readIds(hit.object.userData)
  if (own.deskId || own.deviceId) return pack(hit, layer, own.deskId, own.deviceId)
  const carrier = seenWalk(hit.object, (node) => WORKSTATION.test(node.name))
  if (carrier && hit.instanceId != null) {
    const deskId = deskFromInstance(floorId, hit.instanceId)
    if (deskId) {
      const deviceId = carrier.name === 'WorkstationMonitors' ? `${deskId}-PC` : null
      return pack(hit, 'dense', deskId, deviceId)
    }
  }
  const walked = ancestorIds(hit.object.parent)
  if (walked.deskId || walked.deviceId) return pack(hit, layer, walked.deskId, walked.deviceId)
  return null
}

export function focusAt(hits: readonly CycleHit[], cycle: number, floorId: string | null): CycleFocus | null {
  if (hits.length === 0 || !Number.isFinite(cycle)) return null
  const span = hits.length
  const index = ((Math.round(cycle) % span) + span) % span
  const hit = hits[index]
  if (!hit) return null
  return focusOfHit(hit, floorId)
}

/** 只写侧栏焦点。不带 view、focusSeq、镜头和视角令牌。 */
export function sidebarFocusPatch(
  focus: CycleFocus | null,
  current: { focusedDeskId: string | null; focusedDeviceId: string | null },
): { focusedDeskId: string | null; focusedDeviceId: string | null } | null {
  if (!focus || (!focus.deskId && !focus.deviceId)) return null
  if (current.focusedDeskId === focus.deskId && current.focusedDeviceId === focus.deviceId) return null
  return { focusedDeskId: focus.deskId, focusedDeviceId: focus.deviceId }
}

export function pointerOnCanvas(target: unknown, canvas: unknown): boolean {
  if (target == null || canvas == null) return false
  if (target === canvas) return true
  return typeof Node !== 'undefined' && target instanceof Node && canvas instanceof Node && canvas.contains(target)
}

function targetBlocks(target: CycleTarget | null | undefined): boolean {
  if (!target) return false
  const tag = target.tagName?.toUpperCase()
  if (tag && BLOCK_TAGS.has(tag)) return true
  if (target.isContentEditable === true) return true
  if (typeof target.closest === 'function') {
    if (target.closest('dialog')) return true
    if (target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return true
  }
  return false
}

/**
 * 返回 null 表示这一下 Tab 可以交给 CycleRaycast。
 * 其它原因要在捕获阶段拦住，避免文档级监听把框选、拖摆、镜头和侧栏输入一起带走。
 */
export function cycleBlockReason(event: CycleKeyEvent, activity: CycleActivity): CycleBlock | null {
  const code = event.keyCode || event.which || 0
  const tab = event.key === 'Tab' || code === CYCLE_KEY_CODE
  if (!tab) return 'key'
  if (event.repeat) return 'repeat'
  if (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return 'modifier'
  if (activity.dragging) return 'drag'
  if (activity.boxSelecting) return 'box'
  if (activity.pointerDown) return 'camera'
  if (targetBlocks(event.target)) return 'field'
  const onCanvas = activity.pointerOnCanvas || event.target?.tagName?.toUpperCase() === 'CANVAS'
  if (!onCanvas) return 'away'
  return null
}

/** 框选或拖摆进行时卸下 filter，把射线顺序还给原来的监听。 */
export function cycleHoldsFilter(activity: Pick<CycleActivity, 'dragging' | 'boxSelecting'>): boolean {
  return activity.dragging || activity.boxSelecting
}
