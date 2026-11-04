import { badgeExplodeDelta, syncFloorBadgeLifts } from '../scene/badgeExplodePose'
import { floorExplodeAnimating, syncExplodeInstancePick } from '../scene/pick/explodePick'
import {
  STATION_EXPLODE_GAP_M,
  applyMemberProgress,
  applyStationProgress,
  bakeStationPairs,
  levelFrame,
  markStationDynamic,
  matrixFromArray,
  matrixHandle,
  matrixWithTranslation,
  negativeScale,
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
  getMatrixAt?: (index: number, matrix: MatrixReader) => unknown
  instanceMatrix?: {
    array?: ArrayLike<number>
    needsUpdate: boolean
    setUsage?: (usage: number) => void
  }
  computeBoundingSphere?: () => void
  _matricesTexture?: { needsUpdate: boolean }
  /** three r186 BatchedMesh 的实例表。删掉的槽 active 为 false，setMatrixAt 会抛。 */
  _instanceInfo?: ArrayLike<{ active?: boolean } | undefined>
  _members?: MemberSink[] | Map<MemberSink, unknown>
  sync?: (callback?: () => void) => void
  getObjectByName?: (name: string) => StationNode | undefined
  userData?: {
    badgePoseOwned?: boolean
    badgeDynamic?: boolean
    badgeFloorId?: string
    badgeRests?: Array<{ x: number; y: number; z: number }>
  }
}

interface MatrixReader {
  fromArray: (array: ArrayLike<number>, offset?: number) => MatrixReader
}

interface MeshHold {
  name: string
  pairs: StationPair[]
  /** BatchedMesh 的实例 id，与 pairs 一一对应。实例网格为 null，下标即槽号。 */
  ids: number[] | null
  dynamic: boolean
}

export interface StationDrive {
  posed: boolean
  captured: boolean
  /** 停住之后已经按 written 写过一批。进度不变时不再每帧 setMatrixAt。 */
  settled: boolean
  written: number
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
  return { posed: false, captured: false, settled: false, written: Number.NaN, frame: null, meshes: [], members: null }
}

function matrixReader(elements: number[]): MatrixReader {
  const reader: MatrixReader = {
    fromArray(array, offset = 0) {
      for (let i = 0; i < 16; i += 1) elements[i] = Number(array[offset + i] ?? 0)
      return reader
    },
  }
  return reader
}

function liveBatchedId(node: StationNode, id: number): boolean {
  const info = node._instanceInfo
  if (!info || id < 0 || id >= info.length) return false
  return info[id]?.active !== false
}

/**
 * BatchedMesh 没有 instanceMatrix，count 继承自 Mesh 恒为 1。按实例表逐槽 getMatrixAt。
 * 删掉的槽和带镜像缩放的槽不收，之后也不交给 setMatrixAt。
 */
function readBatched(node: StationNode): { rests: Mat4[]; ids: number[] } {
  const rests: Mat4[] = []
  const ids: number[] = []
  const info = node._instanceInfo
  if (!info || typeof node.getMatrixAt !== 'function') return { rests, ids }
  for (let id = 0; id < info.length; id += 1) {
    if (!liveBatchedId(node, id)) continue
    const elements = new Array<number>(16).fill(0)
    node.getMatrixAt(id, matrixReader(elements))
    const rest = { elements }
    if (negativeScale(rest)) continue
    rests.push(rest)
    ids.push(id)
  }
  return { rests, ids }
}

function readInstances(node: StationNode): { rests: Mat4[]; ids: number[] | null } {
  if (node.isBatchedMesh) return readBatched(node)
  const array = node.instanceMatrix?.array
  const count = node.count ?? 0
  if (!array || count <= 0) return { rests: [], ids: null }
  const rests: Mat4[] = []
  for (let index = 0; index < count; index += 1) rests.push(matrixFromArray(array, index))
  return { rests, ids: null }
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
  const write = node.setMatrixAt
  if (typeof write !== 'function') return null
  if (node.isBatchedMesh) {
    // 抓完 rest 之后槽可能被删。BatchedMesh.setMatrixAt 对删掉的槽会抛，这里跳过。
    return {
      count: node._instanceInfo?.length ?? 0,
      setMatrixAt(id, matrix) {
        if (liveBatchedId(node, id)) write.call(node, id, matrix)
      },
    }
  }
  if (!node.isInstancedMesh) return null
  return { count: node.count ?? 0, setMatrixAt: write.bind(node), instanceMatrix: node.instanceMatrix }
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
    // 圆标自己写矩阵时不再烘焙，避免和消费端各加一次位移。
    if (node.userData?.badgePoseOwned) continue
    if (!asSink(node)) continue
    if (readInstances(node).rests.length === 0) continue
    found.push(node)
  }
  const label = scene.getObjectByName(STATION_LABEL_NAME)
  const allMembers = memberList(label)
  const members = plainMembers(allMembers)
  // 几何已经在进层时 sync 过。这里再叫一次，只为脏成员补包；矩阵动画不走 sync。
  if (allMembers.length > 0) label?.sync?.()

  const desk = found.find((node) => node.name === 'WorkstationDesks') ?? found[0]
  const seed = desk ? readInstances(desk).rests : members.length > 0 ? readMembers(members) : []
  if (seed.length === 0 && members.length === 0) return
  const frame = levelFrame(seed.map((matrix) => ({ x: matrix.elements[12], z: matrix.elements[14] })))
  drive.frame = frame

  for (const node of found) {
    const { rests, ids } = readInstances(node)
    if (rests.length === 0) continue
    const baked = bakeStationPairs(rests, frame)
    drive.meshes.push({ name: node.name ?? '', pairs: baked.pairs, ids, dynamic: false })
    const sink = asSink(node)
    if (sink) markStationDynamic(sink)
  }
  if (members.length > 0) {
    drive.members = bakeStationPairs(readMembers(members), frame).pairs
  }
}

function plainMembers(members: MemberSink[]): MemberSink[] {
  return members.filter((member) => !member.userData?.labelPoseOwned)
}

function activeFloorId(): string {
  if (typeof window === 'undefined') return ''
  return window.__twinInterior?.floorId ?? window.__twinFloor?.floorId ?? ''
}

const pose = matrixWithTranslation(0, 0, 0)
const poseHandle = matrixHandle(pose.elements)
const deltaScratch = { x: 0, y: 0, z: 0 }

/** 圆标已记下 rest。一批 setMatrixAt，needsUpdate 只打一次。 */
function writeOwnedBadges(scene: StationNode, frame: LevelFrame | null): { count: number; needsUpdate: number } {
  const node = scene.getObjectByName?.('DeviceBadges')
  const rests = node?.userData?.badgeRests
  if (!node?.userData?.badgePoseOwned || !rests || rests.length === 0) return { count: 0, needsUpdate: 0 }
  const sink = asSink(node)
  if (!sink) return { count: 0, needsUpdate: 0 }
  if (!node.userData.badgeDynamic) {
    markStationDynamic(sink)
    node.userData.badgeDynamic = true
  }
  const floorId = node.userData.badgeFloorId || activeFloorId()
  const count = Math.min(sink.count, rests.length)
  for (let index = 0; index < count; index += 1) {
    const rest = rests[index]
    if (!rest) continue
    badgeExplodeDelta(floorId, rest.x, rest.z, false, frame, deltaScratch)
    pose.elements[12] = rest.x + deltaScratch.x
    pose.elements[13] = rest.y + deltaScratch.y
    pose.elements[14] = rest.z + deltaScratch.z
    sink.setMatrixAt(index, poseHandle)
  }
  if (count > 0 && sink.instanceMatrix) sink.instanceMatrix.needsUpdate = true
  if (count > 0) node.computeBoundingSphere?.()
  return { count, needsUpdate: count > 0 ? 1 : 0 }
}

/** 标签 rest 已含避让。增量按房间锚点，不按挤开后的点重新分层。 */
function writeOwnedLabels(scene: StationNode, frame: LevelFrame | null): number {
  const members = memberList(scene.getObjectByName?.(STATION_LABEL_NAME))
  const floorId = activeFloorId()
  let count = 0
  for (const member of members) {
    const rest = member.userData?.explodeRest
    const anchor = member.userData?.explodeAnchor
    if (!member.userData?.labelPoseOwned || !rest || !anchor) continue
    badgeExplodeDelta(floorId, anchor[0], anchor[1], member.userData.inheritFloorLift === true, frame, deltaScratch)
    const x = rest[0] + deltaScratch.x
    const y = rest[1] + deltaScratch.y
    const z = rest[2] + deltaScratch.z
    if (member.position?.set) {
      member.position.set(x, y, z)
      member.updateMatrix?.()
    } else {
      const target = member.matrix.elements
      target[12] = x
      target[13] = y
      target[14] = z
      member.matrixAutoUpdate = false
      member.matrixWorldNeedsUpdate = true
    }
    count += 1
  }
  return count
}

function write(drive: StationDrive, scene: StationNode, progress: number): { count: number; needsUpdate: number } {
  let count = 0
  let needsUpdate = 0
  for (const hold of drive.meshes) {
    const node = scene.getObjectByName?.(hold.name)
    const sink = node ? asSink(node) : null
    if (!node || !sink || node.userData?.badgePoseOwned) continue
    if (!hold.dynamic) {
      markStationDynamic(sink)
      hold.dynamic = true
    }
    const written = applyStationProgress(sink, hold.pairs, progress, hold.ids)
    count += written
    if (written > 0) {
      needsUpdate += 1
      if (node._matricesTexture) node._matricesTexture.needsUpdate = true
    }
  }
  const members = plainMembers(memberList(scene.getObjectByName?.(STATION_LABEL_NAME)))
  if (drive.members && members.length > 0) {
    const written = applyMemberProgress(members, drive.members, progress)
    count += written
    if (progress === 0) {
      for (const member of members) member.matrixAutoUpdate = true
    }
  }
  const badges = writeOwnedBadges(scene, drive.frame)
  count += badges.count
  needsUpdate += badges.needsUpdate
  count += writeOwnedLabels(scene, drive.frame)
  return { count, needsUpdate }
}

function publishStationPose(frame: LevelFrame | null): void {
  if (typeof window === 'undefined') return
  window.__twinStationFrame = frame
  syncFloorBadgeLifts()
}

export function driveStation(
  drive: StationDrive,
  scene: StationNode | null | undefined,
  exploded: boolean,
  view: string,
  now: number,
): StationStats {
  const active = exploded && view === 'floor'
  const tick = stationTick(drive.posed, drive.captured, drive.settled, exploded, view, now, drive.written)
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
  drive.written = tick.written
  if (!tick.captured) {
    drive.meshes = []
    drive.members = null
    drive.frame = null
  }
  publishStationPose(drive.frame)
  // 矩阵写完再刷新包围球。动画中 allowBuild 为假，不补、也不重建局部 BVH。
  const floor = typeof window === 'undefined' ? undefined : window.__twinExplode
  syncExplodeInstancePick(scene, STATION_MESH_NAMES, {
    refresh: tick.write,
    allowBuild: !tick.motion.animating && !floorExplodeAnimating(floor),
  })
  const gap = (drive.frame?.gap ?? STATION_EXPLODE_GAP_M) * tick.motion.progress
  return { progress: tick.motion.progress, animating: tick.motion.animating, active, count, gap, needsUpdate }
}
