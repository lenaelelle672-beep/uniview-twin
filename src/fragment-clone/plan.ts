import { demoEditRequested } from '../demo-edit/flag'

/**
 * T077：演示态把已经加载的路灯 GLTF 片段再浅拷几盏。
 *
 * 主路径仍是 InstancedProp 的 instancedMesh，工位桌椅显示器仍是 InstancedSlots。
 * 这里不换成 Clone，也不碰 BatchedMesh。只在 ?demoEdit=1 多摆 CLONE_CAP 盏。
 *
 * drei `<Clone deep={false}>` 不复制 geometry / material，spread 拿到的是同一份引用。
 * 改克隆体的材质颜色或自发光，场景里那批实例路灯会一起变。deep 保持 false，
 * 打开之后每个片段会各留一份几何和材质。
 * 阴影要显式传 true：drei 只在 castShadow / receiveShadow 为真时写回，传 false 不会清掉源上的值。
 * 不传 inject，条件材质容易漏挂。
 */

export const CLONE_CAP = 3
/** drei Clone 的 deep 缺省就是假。这里写死，避免调用点漏传后被改成深拷。 */
export const CLONE_DEEP = false as const
export const CLONE_CAST_SHADOW = true
export const CLONE_RECEIVE_SHADOW = true

/** 路灯 GLB 的两份材质。实例网格上的 material.name 就是这两个。 */
export const LAMP_MATERIAL_NAMES = ['lamp_body', 'lamp_light'] as const

export type LampMaterialName = (typeof LAMP_MATERIAL_NAMES)[number]

export interface LampPart {
  geometry: { uuid: string }
  material: { name: string }
}

/**
 * 塔楼平面大约 ±30 m × ±13.7 m，南侧朝总览相机（相机在 z≈210）。
 * 三盏落在南立面外的铺地上，y 与实例路灯的落地高度一致。
 */
export const CLONE_SPOTS: readonly {
  id: string
  position: readonly [number, number, number]
  rotation: readonly [number, number, number]
}[] = [
  { id: 'clone-w', position: [-8, 0.12, 28], rotation: [0, 0.5, 0] },
  { id: 'clone-c', position: [0, 0.12, 31], rotation: [0, 0.15, 0] },
  { id: 'clone-e', position: [8, 0.12, 28], rotation: [0, -0.5, 0] },
]

export interface CloneSlotFlags {
  __cloneBridge?: boolean
  __gridBridge?: boolean
  __decalBridge?: boolean
  __tourBridge?: boolean
  __focusBridge?: boolean
}

/** 地址栏或启动地址有 demoEdit=1，且用户没有在本页改过开关。 */
export function cloneEnabled(override: boolean | null, search: string, navigation = ''): boolean {
  if (override != null) return override
  return demoEditRequested(search) || demoEditRequested(navigation)
}

export function fragmentKey(parts: readonly LampPart[]): string {
  return parts.map((part) => `${part.material.name}:${part.geometry.uuid}`).join('|')
}

function asLampPart(obj: unknown): LampPart | null {
  if (!obj || typeof obj !== 'object') return null
  const record = obj as {
    isInstancedMesh?: boolean
    geometry?: { uuid?: string }
    material?: { name?: string } | readonly unknown[]
  }
  if (record.isInstancedMesh !== true) return null
  const geometry = record.geometry
  if (!geometry?.uuid) return null
  const material = record.material
  if (!material || typeof material !== 'object' || Array.isArray(material)) return null
  const named = material as { name?: string }
  const name = named.name
  if (name !== 'lamp_body' && name !== 'lamp_light') return null
  // 返回场景里的那份几何和材质，不要抄出只剩 uuid 的替身。
  return { geometry: geometry as { uuid: string }, material: named as { name: string } }
}

/**
 * 只认实例化主路径上的路灯片段。普通 Mesh（包括我们自己的浅拷）不算，
 * 避免克隆结果再被当成源，越拷越多。两份材质没齐就先不摆。
 */
export function findLampParts(root: { traverse(visitor: (obj: unknown) => void): void }): LampPart[] {
  const byName = new Map<string, LampPart>()
  root.traverse((obj) => {
    const part = asLampPart(obj)
    if (!part || byName.has(part.material.name)) return
    byName.set(part.material.name, part)
  })
  const ordered: LampPart[] = []
  for (const name of LAMP_MATERIAL_NAMES) {
    const part = byName.get(name)
    if (!part) return []
    ordered.push(part)
  }
  return ordered
}

export function presentCloneSpots<T>(spots: readonly T[], cap = CLONE_CAP): { shown: readonly T[]; dropped: number; cap: number } {
  if (cap > CLONE_CAP) throw new Error(`浅拷最多 ${CLONE_CAP} 个`)
  const shown = spots.slice(0, cap)
  return { shown, dropped: spots.length - shown.length, cap: CLONE_CAP }
}

/**
 * 格网、贴花、导览轨都会包测距槽。等导览轨已经包到外面再包一层，
 * 并把当时的桥标记抄过来，避免两边互相 flush。
 */
export function cloneSlotReady(slot: CloneSlotFlags | null | undefined): boolean {
  if (!slot || slot.__cloneBridge) return false
  return slot.__gridBridge === true && slot.__decalBridge === true && slot.__tourBridge === true
}
