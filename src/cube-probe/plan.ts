/**
 * T129：一次烘完的近场立方体贴图探针。
 * 只给当前这一层房间里的一块金属/玻璃（FloorGlass 或会议室玻璃）烘一张立方体贴图，然后停。
 * drei CubeCamera 的默认 frames 是 Infinity，会在每一帧里 camera.update。这里固定为 1。
 * 不进 hardGate / balancedFx。不使用 Reflector、transmission，也不拉 CDN 环境贴图。
 */

/** 与软阴影、天幕、dock 同一道首帧后窗口。字面量写在这里，懒包不引 three。 */
export const CUBE_PROBE_AFTER_FIRST_MS = 2600

/** 必须传给 CubeCamera 的帧数。1 表示烘完一次就停。 */
export const CUBE_PROBE_FRAMES = 1

/** 立方体贴图边长。一次烘焙，不跟着镜头变。 */
export const CUBE_PROBE_RESOLUTION = 128

export const CUBE_PROBE_NEAR = 0.1

export const CUBE_PROBE_FAR_MIN = 16
export const CUBE_PROBE_FAR_MAX = 96

const EXPLODE_EPS = 1e-3

export const CUBE_PROBE_LAYERS = {
  room: 'single-floor',
  subject: 'room-glass',
  explode: 'exclusive',
  stationExplode: 'exclusive',
  tour: 'exclusive',
  continuous: 'forbidden',
} as const

export interface CubeProbeQuery {
  optIn: boolean
  due: boolean
  view: string
  floorId: string | null
  touring: boolean
  exploded: boolean
  explodeProgress: number
  explodeAnimating: boolean
  stationActive: boolean
  stationAnimating: boolean
  stationProgress: number
}

export type CubeProbeState = 'on' | 'pending' | 'off-switch' | 'off-view' | 'yield-explode' | 'yield-station' | 'yield-tour'

export interface ProbeMaterial {
  transparent?: boolean
  roughness?: number
  depthWrite?: boolean
  metalness?: number
  envMap?: unknown
}

export interface ProbeNode {
  name?: string
  isMesh?: boolean
  visible?: boolean
  count?: number
  material?: ProbeMaterial | ProbeMaterial[] | null
  children?: ProbeNode[]
}

/**
 * 会议室玻璃：半透明、不写深度、粗糙度很低，并且材质上有 envMap 槽。
 * 高亮用的 MeshBasicMaterial 没有 metalness，不会被选进来。
 */
export function isNearFieldGlass(material: ProbeMaterial | null | undefined): boolean {
  if (!material) return false
  if (material.transparent !== true) return false
  if (material.depthWrite !== false) return false
  if (typeof material.roughness !== 'number' || !(material.roughness <= 0.12)) return false
  if (typeof material.metalness !== 'number') return false
  if (!('envMap' in material)) return false
  return true
}

/** 幕墙这类金属。选中高亮换成 Basic 材质之后这里返回 false，避免把高亮色烤进反射。 */
export function isNearFieldMetal(material: ProbeMaterial | null | undefined): boolean {
  if (!material) return false
  if (typeof material.metalness !== 'number' || !(material.metalness >= 0.45)) return false
  if (typeof material.roughness !== 'number' || !(material.roughness <= 0.2)) return false
  if (!('envMap' in material)) return false
  return true
}

export function probeFar(span: number): number {
  if (!Number.isFinite(span) || span <= 0) return CUBE_PROBE_FAR_MIN
  return Math.min(CUBE_PROBE_FAR_MAX, Math.max(CUBE_PROBE_FAR_MIN, span * 1.5))
}

/**
 * 开关默认关。开了也要等首帧窗口，并且只在单层、没在炸开、没在巡游时烘。
 * 总览和蓝图没有「这一间」的玻璃，不烘。
 */
export function cubeProbeState(query: CubeProbeQuery): CubeProbeState {
  if (!query.optIn) return 'off-switch'
  if (!query.due) return 'pending'
  if (query.touring) return 'yield-tour'
  if (query.exploded || query.explodeAnimating || query.explodeProgress > EXPLODE_EPS) return 'yield-explode'
  if (query.stationActive || query.stationAnimating || query.stationProgress > EXPLODE_EPS) return 'yield-station'
  if (query.view !== 'floor' || !query.floorId) return 'off-view'
  return 'on'
}

export function cubeProbeChunkDue(firstFrameAt: number | null | undefined, now: number): boolean {
  if (typeof firstFrameAt !== 'number' || !Number.isFinite(firstFrameAt)) return false
  if (!Number.isFinite(now)) return false
  return now - firstFrameAt >= CUBE_PROBE_AFTER_FIRST_MS
}

/** 窗口过了一次就一直算过。爆炸清掉首帧标记时，探针不因此回到 pending。 */
export function cubeProbeDueLatched(latched: boolean, firstFrameAt: number | null | undefined, now: number): boolean {
  return latched || cubeProbeChunkDue(firstFrameAt, now)
}

/** `?cubeProbe=1` 才打开。缺省和其他值都关。 */
export function cubeProbeOptIn(search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(query).get('cubeProbe') === '1'
}

export function cubeProbeSearchOfUrl(url: string): string {
  const queryAt = url.indexOf('?')
  if (queryAt < 0) return ''
  const hashAt = url.indexOf('#', queryAt)
  return hashAt < 0 ? url.slice(queryAt) : url.slice(queryAt, hashAt)
}

/** 地址栏同步会丢掉 cubeProbe。开关分包晚于同步，所以也看启动地址。 */
export function cubeProbeOptInAtBoot(live: string, navigationUrl: string): boolean {
  return cubeProbeOptIn(live) || cubeProbeOptIn(cubeProbeSearchOfUrl(navigationUrl))
}

function materialOf(node: ProbeNode): ProbeMaterial | null {
  const material = node.material
  if (!material || Array.isArray(material)) return null
  return material
}

function activeMesh(node: ProbeNode): boolean {
  if (node.isMesh !== true) return false
  if (node.visible === false) return false
  if (typeof node.count === 'number' && node.count <= 0) return false
  return true
}

/**
 * 这一间里只挑一块玻璃。有名字的 FloorGlass 优先，否则用第一块会议室玻璃。
 * 不走进 CubeProbe 自己，避免探针把自己收进候选。
 */
export function pickRoomGlass(root: ProbeNode | null | undefined): ProbeNode | null {
  if (!root) return null
  let named: ProbeNode | null = null
  let glass: ProbeNode | null = null
  const walk = (node: ProbeNode) => {
    if (node.name === 'CubeProbe') return
    if (activeMesh(node)) {
      const material = materialOf(node)
      if (node.name === 'FloorGlass' && isNearFieldGlass(material)) named = node
      else if (!glass && isNearFieldGlass(material)) glass = node
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(root)
  return named ?? glass
}
