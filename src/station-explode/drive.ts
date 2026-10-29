import {
  STATION_EXPLODE_GAP_M,
  applyMemberProgress,
  applyStationProgress,
  bakeStationPairs,
  levelFrame,
  markStationDynamic,
  matrixFromArray,
  stationTick,
  type LevelFrame,
  type Mat4,
  type MatrixHandle,
  type MemberSink,
  type StationPair,
} from '../scene/stationExplode'

/** 只动这几份已经在场景里的实例。不新建网格。 */
export const STATION_MESH_NAMES = ['WorkstationDesks', 'WorkstationChairs', 'WorkstationMonitors', 'DeviceBadges'] as const

/** 房间标签合批。成员矩阵和工位共用同一套层。 */
export const STATION_LABEL_NAME = 'RoomLabelBatchedText'

export interface StationNode {
  name?: string
  count?: number
  isInstancedMesh?: boolean
  isBatchedMesh?: boolean
  setMatrixAt?: (index: number, matrix: MatrixHandle) => void
  instanceMatrix?: {
    array?: ArrayLike<number>
    needsUpdate: boolean
    setUsage?: (usage: number) => void
  }
  computeBoundingSphere?: () => void
  _matricesTexture?: { needsUpdate: boolean }
  _members?: MemberSink[] | Map<MemberSink, unknown>
  sync?: (callback?: () => void) => void
  getObjectByName?: (name: string) => StationNode | undefined
}

interface MeshHold {
  name: string
  pairs: StationPair[]
  dynamic: boolean
}

export interface StationDrive {
  posed: boolean
  captured: boolean
  /** 已经写过进度 1 的那一帧。停在展开时不再每帧 setMatrixAt。 */
  settled: boolean
  frame: LevelFrame | null
  meshes: MeshHold[]
  members: StationPair[] | null
}

export interface StationStats {
  progress: number
  animating: boolean
  active: boolean
  count: number
  gap: number
  needsUpdate: number
}

export function createStationDrive(): StationDrive {
  return { posed: false, captured: false, settled: false, frame: null, meshes: [], members: null }
}

function readInstances(node: StationNode): Mat4[] {
  const array = node.instanceMatrix?.array
  const count = node.count ?? 0
  if (!array || count <= 0) return []
  const rests: Mat4[] = []
  for (let index = 0; index < count; index += 1) rests.push(matrixFromArray(array, index))
  return rests
}

function memberList(node: StationNode | undefined): MemberSink[] {
  const raw = node?._members
  if (!raw) return []
  const list: MemberSink[] = []
  if (Array.isArray(raw)) {
    for (const member of raw) {
      if (member?.matrix?.elements) list.push(member)
    }
    return list
  }
  for (const member of raw.keys()) {
    if (member?.matrix?.elements) list.push(member)
  }
  return list
}

function readMembers(members: MemberSink[]): Mat4[] {
  return members.map((member) => {
    const elements = new Array<number>(16)
    for (let i = 0; i < 16; i += 1) elements[i] = Number(member.matrix.elements[i] ?? 0)
    return { elements }
  })
}

function asSink(node: StationNode): { count: number; setMatrixAt: (index: number, matrix: MatrixHandle) => void; instanceMatrix?: StationNode['instanceMatrix'] } | null {
  if (typeof node.setMatrixAt !== 'function') return null
  if (!node.isInstancedMesh && !node.isBatchedMesh) return null
  return { count: node.count ?? 0, setMatrixAt: node.setMatrixAt.bind(node), instanceMatrix: node.instanceMatrix }
}

function capture(drive: StationDrive, scene: StationNode | null | undefined): void {
  drive.meshes = []
  drive.members = null
  drive.frame = null
  if (!scene?.getObjectByName) return

  const found: StationNode[] = []
  for (const name of STATION_MESH_NAMES) {
    const node = scene.getObjectByName(name)
    if (!node) continue
    if (!asSink(node)) continue
    if (readInstances(node).length === 0) continue
    found.push(node)
  }
  const label = scene.getObjectByName(STATION_LABEL_NAME)
  const members = memberList(label)
  // 几何已经在进层时 sync 过。这里再叫一次，只为脏成员补包；矩阵动画不走 sync。
  if (members.length > 0) label?.sync?.()

  const desk = found.find((node) => node.name === 'WorkstationDesks') ?? found[0]
  const seed = desk ? readInstances(desk) : members.length > 0 ? readMembers(members) : []
  if (seed.length === 0 && members.length === 0) return
  const frame = levelFrame(seed.map((matrix) => ({ x: matrix.elements[12], z: matrix.elements[14] })))
  drive.frame = frame

  for (const node of found) {
    const rests = readInstances(node)
    if (rests.length === 0) continue
    const baked = bakeStationPairs(rests, frame)
    drive.meshes.push({ name: node.name ?? '', pairs: baked.pairs, dynamic: false })
    const sink = asSink(node)
    if (sink) markStationDynamic(sink)
    node.computeBoundingSphere?.()
  }
  if (members.length > 0) {
    drive.members = bakeStationPairs(readMembers(members), frame).pairs
  }
}

function write(drive: StationDrive, scene: StationNode, progress: number): { count: number; needsUpdate: number } {
  let count = 0
  let needsUpdate = 0
  for (const hold of drive.meshes) {
    const node = scene.getObjectByName?.(hold.name)
    const sink = node ? asSink(node) : null
    if (!node || !sink) continue
    if (!hold.dynamic) {
      markStationDynamic(sink)
      hold.dynamic = true
    }
    const written = applyStationProgress(sink, hold.pairs, progress)
    count += written
    if (written > 0) {
      needsUpdate += 1
      if (node._matricesTexture) node._matricesTexture.needsUpdate = true
    }
  }
  const members = memberList(scene.getObjectByName?.(STATION_LABEL_NAME))
  if (drive.members && members.length > 0) {
    const written = applyMemberProgress(members, drive.members, progress)
    count += written
    if (progress === 0) {
      for (const member of members) member.matrixAutoUpdate = true
    }
  }
  return { count, needsUpdate }
}

export function driveStation(
  drive: StationDrive,
  scene: StationNode | null | undefined,
  exploded: boolean,
  view: string,
  now: number,
): StationStats {
  const active = exploded && view === 'floor'
  const tick = stationTick(drive.posed, drive.captured, drive.settled, exploded, view, now)
  if (tick.capture) capture(drive, scene)
  let count = 0
  let needsUpdate = 0
  if (tick.write && scene) {
    const written = write(drive, scene, tick.motion.progress)
    count = written.count
    needsUpdate = written.needsUpdate
  } else if (drive.meshes.length > 0 || (drive.members && drive.members.length > 0)) {
    count = drive.meshes.reduce((sum, hold) => sum + hold.pairs.length, 0) + (drive.members?.length ?? 0)
  }
  drive.posed = tick.posed
  drive.captured = tick.captured
  drive.settled = tick.settled
  if (!tick.captured) {
    drive.meshes = []
    drive.members = null
    drive.frame = null
  }
  const gap = (drive.frame?.gap ?? STATION_EXPLODE_GAP_M) * tick.motion.progress
  return { progress: tick.motion.progress, animating: tick.motion.animating, active, count, gap, needsUpdate }
}
