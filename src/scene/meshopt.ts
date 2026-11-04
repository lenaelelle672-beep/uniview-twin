import type { Mesh, Object3D, Texture, WebGLRenderer } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { uploadGpuInBatches } from './openPathChunk'

export function installMeshopt(loader: GLTFLoader) {
  loader.setMeshoptDecoder(MeshoptDecoder)
}

/** 解出来的贴图是 1024² 带 mipmap，一拍只交一张。 */
export const MESHOPT_TEXTURE_BATCH = 1
export const MESHOPT_GEOMETRY_BATCH = 1
/** 一直等不到空闲期时最多再等这么久，道具不能一直挂不上。 */
export const MESHOPT_UPLOAD_IDLE_TIMEOUT_MS = 100

export type MeshoptUploadRenderer = Pick<WebGLRenderer, 'initTexture'> & {
  uploadObject?: (object: Object3D) => void
}

export interface MeshoptUploadStats {
  textures: number
  geometries: number
  turns: number
  ms: number
}

/**
 * 先过一帧再等空闲期，两批不会挤进同一帧。退路和 idleYield.scheduleIdle 一样是 32ms。
 * 不 import idleYield：它顶层带 store，晚加载分包会再打一份 zustand 和 store。
 */
export function meshoptUploadTurn(): Promise<void> {
  return new Promise((resolve) => {
    const idle = () => {
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(() => resolve(), { timeout: MESHOPT_UPLOAD_IDLE_TIMEOUT_MS })
      } else {
        setTimeout(resolve, 32)
      }
    }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(idle)
    else idle()
  })
}

// 不在模块顶层建 Promise：installMeshopt 所在的首屏包要能把这段整个摇掉。
let lane: Promise<unknown> | null = null

async function uploadNow(
  renderer: MeshoptUploadRenderer,
  roots: readonly Object3D[],
  yieldTurn: () => Promise<unknown>,
): Promise<MeshoptUploadStats> {
  const started = performance.now()
  const meshes: Object3D[] = []
  for (const root of roots) {
    root.traverse((child) => {
      if ((child as Mesh).isMesh) meshes.push(child)
    })
  }
  if (meshes.length === 0) return { textures: 0, geometries: 0, turns: 0, ms: 0 }
  // 解析刚结束的那一拍往往还压着别的活，第一批也让一拍。
  await yieldTurn()
  const upload = renderer.uploadObject
  const done = await uploadGpuInBatches({
    renderer: {
      initTexture: (texture) => renderer.initTexture(texture as Texture),
      uploadObject: upload ? (object) => upload.call(renderer, object as Object3D) : undefined,
    },
    meshes,
    yieldTurn,
    textureBatch: MESHOPT_TEXTURE_BATCH,
    geometryBatch: MESHOPT_GEOMETRY_BATCH,
  })
  return {
    textures: done.textures,
    geometries: done.geometries,
    turns: done.yields + 1,
    ms: Math.round(performance.now() - started),
  }
}

/**
 * T111：MeshoptDecoder 解开之后、挂进场景之前，把贴图 texImage 和几何缓冲分帧交给 GPU。
 * GLTFLoader 已给贴图置了 needsUpdate，这里一拍消费一张；挂上后的首个可见帧不再整批上传。
 * 只交缓冲不绘制，解码和着色器编译不在这里。几处同时调用时排成一队，全局仍是一拍一批。
 * installMeshopt 在首屏 index 里。本函数只给 dock 之后的独立分包用，vite 图里有人 import 就会整段进 hardGate。
 */
export function uploadMeshoptDecoded(
  renderer: MeshoptUploadRenderer | null | undefined,
  roots: readonly Object3D[],
  yieldTurn: () => Promise<unknown> = meshoptUploadTurn,
): Promise<MeshoptUploadStats> {
  if (!renderer) return Promise.resolve({ textures: 0, geometries: 0, turns: 0, ms: 0 })
  const job = (lane ?? Promise.resolve()).then(() => uploadNow(renderer, roots, yieldTurn))
  lane = job.catch(() => undefined)
  return job
}
