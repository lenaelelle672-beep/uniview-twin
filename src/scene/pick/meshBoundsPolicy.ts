/**
 * T078：哪些网格走 drei meshBounds，以及开关。
 * 这里不 import drei，也不 import three。门闩可以打进 DemandLoop 尾部，drei 仍留在另一包。
 *
 * 精确点选不在这里：楼层壳、楼板、测距面、工位、Bvh 包住的网格保持原来的 raycast。
 * 性能档默认开。均衡 / 高画质默认关。`meshBounds=1` 强制开，`meshBounds=0` 强制关。
 * 地址栏同步会丢掉未知参数，所以还认启动导航地址里的那一次。
 */

export const MESH_BOUNDS_SCAN_MS = 500

export type CoarseKind = 'grille' | 'tree' | 'lamp' | 'sign' | 'person'

export type MeshBoundsReason = 'perf' | 'flag' | 'off' | 'wait'

export type MeshBoundsProbe = {
  on: boolean
  reason: MeshBoundsReason
  count: number
  kinds: Record<CoarseKind, number>
  names: string[]
}

export interface CoarseNode {
  isMesh?: boolean
  isSkinnedMesh?: boolean
  name: string
  geometry?: { getAttribute?: (name: string) => { count?: number } | undefined } | null
  material?: { name?: string } | Array<{ name?: string }> | null
  userData: Record<string, unknown>
  raycast?: unknown
  parent?: { name: string; parent?: CoarseNode['parent'] } | null
  constructor?: { prototype?: { raycast?: unknown } }
}

declare global {
  interface Window {
    __twinMeshBounds?: MeshBoundsProbe
  }
}

const PRECISE_NAME =
  /^(Park|Parcel|FloorSlab|B1Slab|B1|B1Pick|FloorCores|FloorColumns|FloorWalls|FloorGlass|WorkstationDesks|WorkstationChairs|WorkstationMonitors|OfficeDesks|PantryPad|CourtyardWall|tree_leaves_shadow)$/

const PRECISE_PREFIX = /^(FloorShell-|FloorCurtain-|FloorBand-|PickBvh:|Desk|Device)/

const KIND_LABEL: Record<CoarseKind, string> = {
  grille: 'EastGrille',
  tree: 'street-tree',
  lamp: 'street-lamp',
  sign: 'roof-sign',
  person: 'CorridorPeople',
}

export function emptyKinds(): Record<CoarseKind, number> {
  return { grille: 0, tree: 0, lamp: 0, sign: 0, person: 0 }
}

export function kindLabel(kind: CoarseKind): string {
  return KIND_LABEL[kind]
}

export function queryText(value: string): string {
  const hash = value.indexOf('#')
  const before = hash >= 0 ? value.slice(0, hash) : value
  const at = before.indexOf('?')
  return at >= 0 ? before.slice(at + 1) : before
}

export function meshBoundsFlag(value: string): 'on' | 'off' | null {
  const flag = new URLSearchParams(queryText(value)).get('meshBounds')
  if (flag === '1') return 'on'
  if (flag === '0') return 'off'
  return null
}

/** 地址上写死关闭时，不必再等画质切换。 */
export function meshBoundsFlagLockedOff(search: string, navigation = ''): boolean {
  const live = meshBoundsFlag(search)
  if (live === 'on') return false
  if (live === 'off') return true
  return meshBoundsFlag(navigation) === 'off'
}

/**
 * 默认关：均衡和高画质不改 raycast。
 * 性能档开。`?meshBounds=1` 在任意画质开，`?meshBounds=0` 在性能档也关。
 */
export function coarseMeshBoundsEnabled(quality: string, search: string, navigation = ''): boolean {
  const live = meshBoundsFlag(search)
  if (live === 'off') return false
  if (live === 'on') return true
  const remembered = meshBoundsFlag(navigation)
  if (remembered === 'off') return false
  if (remembered === 'on') return true
  return quality === 'perf'
}

export function coarseMeshBoundsReason(search: string, navigation = ''): 'perf' | 'flag' {
  if (meshBoundsFlag(search) === 'on' || meshBoundsFlag(navigation) === 'on') return 'flag'
  return 'perf'
}

export function publishMeshBounds(probe: MeshBoundsProbe): void {
  if (typeof window === 'undefined') return
  window.__twinMeshBounds = probe
}

export function publishMeshBoundsOff(reason: 'off' | 'wait' = 'off'): void {
  publishMeshBounds({
    on: false,
    reason,
    count: 0,
    kinds: emptyKinds(),
    names: [],
  })
}

function materialNames(node: CoarseNode): string[] {
  const material = node.material
  const list = Array.isArray(material) ? material : material ? [material] : []
  const names: string[] = []
  for (const item of list) {
    if (item?.name) names.push(item.name)
  }
  return names
}

function hasPositions(node: CoarseNode): boolean {
  const geometry = node.geometry
  if (!geometry?.getAttribute) return false
  const position = geometry.getAttribute('position')
  return (position?.count ?? 0) > 0
}

function namedAncestor(node: CoarseNode, name: string): boolean {
  let current: CoarseNode['parent'] | CoarseNode | null | undefined = node
  while (current) {
    if (current.name === name) return true
    current = current.parent
  }
  return false
}

function underPreciseRoot(node: CoarseNode): boolean {
  let current: CoarseNode['parent'] | null | undefined = node.parent
  while (current) {
    if (current.name.startsWith('PickBvh') || current.name === 'Workstations' || current.name.startsWith('FloorShell-')) {
      return true
    }
    current = current.parent
  }
  return false
}

function defaultRaycast(node: CoarseNode): boolean {
  if (node.userData.twinMeshBounds === true) return true
  const fallback = node.constructor?.prototype?.raycast
  return fallback != null && node.raycast === fallback
}

/**
 * 远距 / 装饰密模。
 * 东立面格栅、行道树、路灯、屋面字，以及走廊人物（蒙皮，射线前要重算 bounds）。
 * 楼层壳、楼板、测距地面、工位、框选代理、阴影专用叶不进。
 */
export function coarseDecorKind(object: CoarseNode): CoarseKind | null {
  if (object.isMesh !== true || !hasPositions(object)) return null
  if (PRECISE_NAME.test(object.name) || PRECISE_PREFIX.test(object.name)) return null
  if (object.userData.boxPickProxy === true) return null
  if (object.userData.floorStencil === true || object.userData.floorStencilProp === true) return null
  if (object.userData.pickBvhHome) return null
  if (underPreciseRoot(object)) return null
  if (!defaultRaycast(object)) return null
  if (namedAncestor(object, 'EastGrille')) return 'grille'
  if (namedAncestor(object, 'CorridorPeople') && object.isSkinnedMesh === true) return 'person'
  const names = materialNames(object)
  if (names.includes('tree_trunk') || names.includes('tree_leaves')) return 'tree'
  if (names.some((name) => name.startsWith('lamp_'))) return 'lamp'
  if (names.some((name) => name === 'sign_face' || name === 'sign_face_cn' || name === 'sign_body')) return 'sign'
  return null
}

export function coarseMeshLabel(node: CoarseNode, kind: CoarseKind): string {
  const material = materialNames(node)[0]
  return `${kind}:${node.name || material || 'mesh'}`
}
