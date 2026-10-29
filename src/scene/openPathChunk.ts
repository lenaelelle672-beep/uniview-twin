/**
 * T089：打开路径长任务在首帧之后切片。
 * 首帧前仍只保壳、相机和 __twinReady（T032 / 软阴影 2600ms 门不改）。
 * 让出顺序：浏览器 scheduler.yield → requestIdleCallback → 分帧。
 * 传递依赖 scheduler@0.28.0 没有 yield 导出，这里不 import 它，避免再打进首屏。
 */

export const TEXTURE_UPLOAD_BATCH = 2
export const GEOMETRY_UPLOAD_BATCH = 1

export const OPEN_PATH_BEFORE_FIRST = ['shell', 'camera', '__twinReady'] as const

export const OPEN_PATH_LONG_TASKS = [
  {
    id: 'glb-parse',
    when: 'after-first',
    note: '树 lo / 东立面 lo 仍在 __twinReady 之前。室内平面在 2600ms 门后按层解析，层间让出。',
  },
  {
    id: 'texture-upload',
    when: 'after-first',
    note: 'initTexture（texImage）每批最多 2 张，批间让出主线程。',
  },
  {
    id: 'geometry-upload',
    when: 'after-first',
    note: '有 uploadObject 时按网格分批上传；three 0.186 没有这个方法时不假画一帧去上传。',
  },
  {
    id: 'bvh',
    when: 'after-first',
    note: 'PickBvh 一次多挂一组，空闲后再长下一组。',
  },
  {
    id: 'batched-labels',
    when: 'after-first',
    note: '批标签成员分段让出，batch.sync 前再让出，同步后分批 initTexture。',
  },
] as const

export type YieldKind = 'scheduler.yield' | 'requestIdleCallback' | 'animationFrame' | 'timeout'

interface NativeScheduler {
  yield?: () => Promise<unknown>
}

function nativeYield(): (() => Promise<unknown>) | null {
  const host = globalThis as { scheduler?: NativeScheduler }
  const fn = host.scheduler?.yield
  if (typeof fn !== 'function') return null
  return () => fn.call(host.scheduler)
}

/** 首帧后的长任务让出一拍。不引用 npm scheduler。 */
export async function yieldMain(): Promise<YieldKind> {
  const viaScheduler = nativeYield()
  if (viaScheduler) {
    await viaScheduler()
    return 'scheduler.yield'
  }
  if (typeof requestIdleCallback === 'function') {
    await new Promise<void>((resolve) => {
      requestIdleCallback(() => resolve(), { timeout: 50 })
    })
    return 'requestIdleCallback'
  }
  if (typeof requestAnimationFrame === 'function') {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })
    return 'animationFrame'
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
  return 'timeout'
}

const TEXTURE_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'lightMap', 'bumpMap', 'alphaMap'] as const

interface TextureSlot {
  isTexture?: boolean
  image?: unknown
}

interface UploadMesh {
  isMesh?: boolean
  geometry?: object
  material?: TextureSlot | TextureSlot[] | null
}

export interface GpuUploader {
  initTexture?: (texture: object) => void
  uploadObject?: (object: object) => void
}

function isUploadMesh(object: object): object is UploadMesh {
  const mesh = object as UploadMesh
  return mesh.isMesh === true || mesh.geometry != null
}

function collectTextures(meshes: readonly UploadMesh[]): TextureSlot[] {
  const textures: TextureSlot[] = []
  const seen = new Set<TextureSlot>()
  for (const mesh of meshes) {
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const material of materials) {
      if (!material) continue
      for (const key of TEXTURE_KEYS) {
        const texture = (material as Record<string, TextureSlot | null | undefined>)[key]
        if (!texture || texture.isTexture === false || texture.image == null || seen.has(texture)) continue
        seen.add(texture)
        textures.push(texture)
      }
    }
  }
  return textures
}

export async function uploadGpuInBatches(input: {
  renderer: GpuUploader
  meshes: readonly object[]
  yieldTurn?: () => Promise<unknown>
  textureBatch?: number
  geometryBatch?: number
}): Promise<{ textures: number; geometries: number; yields: number }> {
  const textureBatch = Math.max(1, input.textureBatch ?? TEXTURE_UPLOAD_BATCH)
  const geometryBatch = Math.max(1, input.geometryBatch ?? GEOMETRY_UPLOAD_BATCH)
  const meshes = input.meshes.filter(isUploadMesh)
  const textures = collectTextures(meshes)
  let yields = 0
  const pause = async () => {
    yields += 1
    if (input.yieldTurn) await input.yieldTurn()
    else await yieldMain()
  }

  let textureCount = 0
  for (let index = 0; index < textures.length; index += textureBatch) {
    if (index > 0) await pause()
    const end = Math.min(textures.length, index + textureBatch)
    for (let cursor = index; cursor < end; cursor += 1) {
      const texture = textures[cursor]
      if (!texture || !input.renderer.initTexture) continue
      input.renderer.initTexture(texture)
      textureCount += 1
    }
  }

  let geometryCount = 0
  for (let index = 0; index < meshes.length; index += geometryBatch) {
    if (index > 0 || textureCount > 0) await pause()
    const end = Math.min(meshes.length, index + geometryBatch)
    for (let cursor = index; cursor < end; cursor += 1) {
      const mesh = meshes[cursor]
      if (!mesh || !input.renderer.uploadObject) continue
      input.renderer.uploadObject(mesh)
      geometryCount += 1
    }
  }

  return { textures: textureCount, geometries: geometryCount, yields }
}

/** 拾取树一次多挂一组。签名没变就原样返回，避免把已经挂上的组卸掉重建。 */
export function growBvhMount<T>(
  prev: readonly T[],
  target: readonly T[],
  signature: (groups: readonly T[]) => string,
): T[] {
  if (signature(prev) === signature(target)) return prev as T[]
  if (target.length === 0) return []
  if (target.length < prev.length && signature(target) === signature(prev.slice(0, target.length))) {
    return target.slice()
  }
  if (prev.length > 0 && signature(prev) === signature(target.slice(0, prev.length))) {
    return target.slice(0, Math.min(target.length, prev.length + 1))
  }
  return target.slice(0, 1)
}
