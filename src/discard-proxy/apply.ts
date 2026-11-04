import type { Material, Object3D } from 'three'

/**
 * T115：把 drei MeshDiscardMaterial 克隆到拾取代理上。
 * 只认 boxPickProxy / DeskPickProxy。业务网格、实例网格、材质数组不动。
 * 不改 mesh.visible，不改 raycast：框选仍走 SelectionBox，BVH 仍按原来的 arm / silence 换射线函数。
 * 划界：新材质保持可见，靠关掉颜色和深度写入来藏起来，不沿用占位材质的隐藏开关。
 */

const MARK = 'meshDiscard'
const PREV = 'meshDiscardPrev'

const BUSINESS_NAME =
  /^(WorkstationDesks|WorkstationChairs|WorkstationMonitors|OfficeDesks|FloorSlab|FloorPlate|B1Slab|B1|EastGrille|CorridorPeople|FloorCores|FloorColumns|FloorWalls|FloorGlass|PantryPad|CourtyardWall|FloorShell-.+|DeviceBadges)$/

interface ProxyObject extends Object3D {
  isMesh?: boolean
  isInstancedMesh?: boolean
  material?: Material | Material[]
}

const applied = new Set<ProxyObject>()
let cachedRoot: Object3D | null = null

export function isDiscardProxyTarget(object: Object3D): boolean {
  const node = object as ProxyObject
  if (node.isMesh !== true || node.isInstancedMesh === true) return false
  if (Array.isArray(node.material)) return false
  if (node.name === 'MeshDiscardHost') return false
  if (BUSINESS_NAME.test(node.name)) return false
  return node.userData.boxPickProxy === true || node.name === 'DeskPickProxy'
}

/** 不写颜色、不写深度。visible 保持 true，和占位材质的 visible:false 分开。 */
export function configureDiscardMaterial(material: Material): Material {
  material.colorWrite = false
  material.depthWrite = false
  material.toneMapped = false
  material.visible = true
  return material
}

function restoreNode(node: ProxyObject): void {
  if (node.userData[MARK] !== true) return
  const prev = node.userData[PREV]
  const current = node.material
  if (prev !== undefined) node.material = prev as Material
  if (current && current !== prev && !Array.isArray(current)) current.dispose()
  delete node.userData[MARK]
  delete node.userData[PREV]
}

function findProxyRoot(scene: Object3D): Object3D | null {
  if (cachedRoot?.parent) return cachedRoot
  cachedRoot = null
  scene.traverse((child) => {
    if (!cachedRoot && child.name === 'DeskPickProxies') cachedRoot = child
  })
  return cachedRoot
}

function remember(node: ProxyObject, source: Material): void {
  const current = Array.isArray(node.material) ? undefined : node.material
  if (node.userData[MARK] === true && current && current !== node.userData[PREV]) {
    configureDiscardMaterial(current)
    applied.add(node)
    return
  }
  const next = configureDiscardMaterial(source.clone())
  if (node.userData[MARK] !== true) node.userData[PREV] = node.material
  node.material = next
  node.userData[MARK] = true
  applied.add(node)
}

/** 只扫工位拾取代理组。找不到组时把已经加深的网格还原。 */
export function syncDiscardProxies(scene: Object3D, source: Material): number {
  const root = findProxyRoot(scene)
  if (!root) {
    releaseDiscardProxies(scene)
    return 0
  }
  const seen = new Set<ProxyObject>()
  root.traverse((child) => {
    if (!isDiscardProxyTarget(child)) return
    const node = child as ProxyObject
    seen.add(node)
    remember(node, source)
  })
  for (const node of applied) {
    if (seen.has(node)) continue
    restoreNode(node)
    applied.delete(node)
  }
  return seen.size
}

export function releaseDiscardProxies(scene: Object3D): void {
  const seen = new Set<ProxyObject>()
  scene.traverse((child) => {
    const node = child as ProxyObject
    seen.add(node)
    restoreNode(node)
  })
  for (const node of applied) {
    if (!seen.has(node)) restoreNode(node)
  }
  applied.clear()
  cachedRoot = null
}

export function resetDiscardProxyForTests(): void {
  for (const node of applied) restoreNode(node)
  applied.clear()
  cachedRoot = null
}
