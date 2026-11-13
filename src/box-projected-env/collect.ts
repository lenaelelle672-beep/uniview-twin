import { finishBoxProjection } from './bridge'
import { CURTAIN_BOUNDARY_NAMES, CURTAIN_CACHE_KEYS } from './plan'

/**
 * 只改进入房间后室内材质的 onBeforeCompile / customProgramCacheKey。
 * 不写 envMap、不写 envMapIntensity，幕墙那一侧的强度保持原样。
 * 有 transmission 的材质不挂。不使用 Reflector。
 */

const CURTAIN_NAMES = new Set<string>(CURTAIN_BOUNDARY_NAMES)
const CURTAIN_KEYS = new Set<string>(CURTAIN_CACHE_KEYS)

export const BOX_ENV_USER_DATA = 'boxProjectedEnv'

export interface BoxShader {
  vertexShader: string
  fragmentShader: string
  defines: Record<string, string | number | boolean> | undefined
  uniforms: Record<string, { value: unknown }>
}

export type BoxCompile = (shader: BoxShader) => void

export interface PatchableMaterial {
  name: string
  isMeshStandardMaterial?: boolean
  transmission?: number
  envMap?: unknown
  envMapIntensity?: number
  onBeforeCompile: Function
  customProgramCacheKey: Function
  needsUpdate: boolean
  userData: Record<string, unknown>
}

interface SceneNode {
  material?: PatchableMaterial | PatchableMaterial[] | null
  traverse?: (callback: (child: SceneNode) => void) => void
}

interface SavedPatch {
  onBeforeCompile: Function
  customProgramCacheKey: Function
}

const saved = new WeakMap<PatchableMaterial, SavedPatch>()

export function isCurtainBoundary(material: { name?: string; customProgramCacheKey?: Function }): boolean {
  if (material.name && CURTAIN_NAMES.has(material.name)) return true
  if (typeof material.customProgramCacheKey !== 'function') return false
  try {
    const key = material.customProgramCacheKey()
    return typeof key === 'string' && CURTAIN_KEYS.has(key)
  } catch {
    return false
  }
}

export function isIndoorEnvMaterial(material: object): material is PatchableMaterial {
  const mat = material as PatchableMaterial
  if (mat.isMeshStandardMaterial !== true) return false
  if (typeof mat.transmission === 'number' && mat.transmission > 0) return false
  if (typeof mat.onBeforeCompile !== 'function' || typeof mat.customProgramCacheKey !== 'function') return false
  if (isCurtainBoundary(mat)) return false
  return true
}

/** 只走当前 FloorInterior。外壳幕墙不在这棵子树里。 */
export function collectIndoorMaterials(root: SceneNode): PatchableMaterial[] {
  const found: PatchableMaterial[] = []
  const seen = new Set<PatchableMaterial>()
  const visit = (node: SceneNode) => {
    const material = node.material
    const list = Array.isArray(material) ? material : material ? [material] : []
    for (const item of list) {
      if (!item || seen.has(item) || !isIndoorEnvMaterial(item)) continue
      seen.add(item)
      found.push(item)
    }
  }
  if (typeof root.traverse === 'function') root.traverse(visit)
  else visit(root)
  return found
}

export function sameMaterials(prev: readonly PatchableMaterial[], next: readonly PatchableMaterial[]): boolean {
  if (prev.length !== next.length) return false
  for (let index = 0; index < prev.length; index += 1) {
    if (prev[index] !== next[index]) return false
  }
  return true
}

/**
 * 把 useBoxProjectedEnv 交回的 onBeforeCompile 套到室内材质上。
 * 幕墙边界和 transmission 直接跳过，强度和 envMap 原样不动。
 */
export function attachIndoorProjection(
  materials: readonly PatchableMaterial[],
  compile: BoxCompile,
  cacheKey: () => string,
): number {
  let count = 0
  for (const material of materials) {
    if (!isIndoorEnvMaterial(material)) continue
    const intensity = material.envMapIntensity
    const envMap = material.envMap
    if (!saved.has(material)) {
      saved.set(material, {
        onBeforeCompile: material.onBeforeCompile,
        customProgramCacheKey: material.customProgramCacheKey,
      })
    }
    const original = saved.get(material)
    if (!original) continue
    material.onBeforeCompile = function (shader: BoxShader, renderer?: unknown) {
      original.onBeforeCompile.call(material, shader, renderer)
      compile(shader)
      finishBoxProjection(shader)
    }
    material.customProgramCacheKey = function () {
      const prev = original.customProgramCacheKey.call(material)
      return `${typeof prev === 'string' ? prev : ''}|box-env|${cacheKey()}`
    }
    material.userData[BOX_ENV_USER_DATA] = true
    material.needsUpdate = true
    if (material.envMapIntensity !== intensity) material.envMapIntensity = intensity
    if (material.envMap !== envMap) material.envMap = envMap
    count += 1
  }
  return count
}

/** 离开房间时交还原来的编译钩子。 */
export function detachIndoorProjection(materials: readonly PatchableMaterial[]): void {
  for (const material of materials) {
    const original = saved.get(material)
    if (!original) continue
    material.onBeforeCompile = original.onBeforeCompile
    material.customProgramCacheKey = original.customProgramCacheKey
    material.needsUpdate = true
    delete material.userData[BOX_ENV_USER_DATA]
    saved.delete(material)
  }
}
