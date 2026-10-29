import { type Mesh, type Object3D, type WebGLRenderer } from 'three'
import { floorSpec } from '../../data/floors'
import { buildPrebuiltInteriorSliced, markInteriorUploaded, peekPrebuiltInterior } from '../../floors/floorInteriorMesh'
import { loadFloorPlan } from '../../floors/loadFloor'
import { uploadGpuInBatches, yieldMain } from '../openPathChunk'
import { compileClippedShellMaterials, glyphTimingProbeEnabled } from './glyphProbe'

/**
 * 首帧后约 2.6s 再解析和上传。前面那段是总览着色器落地，插进去会把 180ms 的呈现拖过 D263 起算点。
 * ready+0.5/+1.5/+3s 的按下窗口不新开切片。上传只交缓冲，不绘制。
 */
export const INTERIOR_PREWARM_AFTER_FIRST_MS = 2600

const CLICK_OFFSETS_MS = [500, 1500, 3000]

const FLOORS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'] as const

let started = false

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

function notePrewarm(patch: Partial<NonNullable<Window['__twinInteriorPrewarm']>>) {
  if (!glyphTimingProbeEnabled()) return
  window.__twinInteriorPrewarm = {
    ...(window.__twinInteriorPrewarm ?? { floors: {}, done: false }),
    ...patch,
    floors: patch.floors ?? window.__twinInteriorPrewarm?.floors ?? {},
  }
}

function noteFloor(floorId: string, row: NonNullable<NonNullable<Window['__twinInteriorPrewarm']>['floors']>[string]) {
  if (!glyphTimingProbeEnabled()) return
  const floors = { ...(window.__twinInteriorPrewarm?.floors ?? {}), [floorId]: row }
  notePrewarm({ floors })
}

function inClickWindow(): boolean {
  const readyAt = window.__twinReadyAt
  if (readyAt == null) return false
  const rel = performance.now() - readyAt
  return CLICK_OFFSETS_MS.some((offset) => rel >= offset - 120 && rel <= offset + 40)
}

async function waitTurn(pointerDown: () => boolean) {
  for (;;) {
    const first = window.__twinFirstFrameAt
    const settled = first != null && performance.now() >= first + INTERIOR_PREWARM_AFTER_FIRST_MS
    if (settled && !pointerDown() && window.__twinView !== 'floor' && !inClickWindow()) return
    await nextFrame()
  }
}

/**
 * 只把几何和贴图交给 GPU，不调用 render。
 * texImage 与 uploadObject 分批，批间让出主线程。
 * 空场景绘制会另编程序，SwiftShader 上 GetProgramiv 能把一帧拖到几百毫秒。
 * 程序预热仍走 compileAsync(root, camera, 主场景)。
 */
async function uploadMeshes(renderer: WebGLRenderer, root: Object3D, pointerDown: () => boolean) {
  const upload = (renderer as WebGLRenderer & { uploadObject?: (object: Object3D) => void }).uploadObject
  const meshes: Mesh[] = []
  root.traverse((object) => {
    const mesh = object as Mesh
    if (mesh.isMesh) meshes.push(mesh)
  })
  for (const mesh of meshes) mesh.frustumCulled = false
  const uploaded = await uploadGpuInBatches({
    renderer: {
      initTexture: (texture) => {
        renderer.initTexture(texture as never)
      },
      uploadObject: upload ? (object) => upload.call(renderer, object as Object3D) : undefined,
    },
    meshes,
    yieldTurn: async () => {
      await waitTurn(pointerDown)
      await yieldMain()
    },
  })
  if (!upload && uploaded.textures === 0) return 0
  return meshes.length
}

async function compileInterior(root: Object3D) {
  const renderer = window.__twinRenderer
  const camera = window.__twinCamera
  const scene = window.__twinScene
  if (!renderer || !camera || !scene) return false
  const previous = renderer.getRenderTarget()
  const input = window.__twinComposerInput
  if (window.__twinComposerLive && input) renderer.setRenderTarget(input)
  if (typeof renderer.compileAsync === 'function') {
    const pending = renderer.compileAsync(root, camera, scene)
    renderer.setRenderTarget(previous)
    await pending
  } else {
    renderer.compile(root, camera, scene)
    renderer.setRenderTarget(previous)
  }
  return true
}

export function scheduleFloorInteriorPrewarm(): void {
  if (started || typeof window === 'undefined') return
  started = true
  let pointer = false
  const down = () => {
    pointer = true
  }
  const up = () => {
    pointer = false
  }
  window.addEventListener('pointerdown', down, true)
  window.addEventListener('pointerup', up, true)
  window.addEventListener('pointercancel', up, true)
  void run(() => pointer)
}

async function run(pointerDown: () => boolean) {
  const plans = new Map<string, Awaited<ReturnType<typeof loadFloorPlan>>>()
  const parseMsByFloor = new Map<string, number>()
  for (const floorId of FLOORS) {
    await waitTurn(pointerDown)
    const parseStart = performance.now()
    plans.set(floorId, await loadFloorPlan(floorId))
    parseMsByFloor.set(floorId, Math.round(performance.now() - parseStart))
    await yieldMain()
  }
  await compileClippedShellMaterials()
  for (const floorId of FLOORS) {
    const plan = plans.get(floorId)
    if (!plan) continue
    await waitTurn(pointerDown)
    let step = performance.now()
    let buildMs = 0
    const built = await buildPrebuiltInteriorSliced(floorSpec(floorId), plan, async () => {
      buildMs += Math.round(performance.now() - step)
      await yieldMain()
      await waitTurn(pointerDown)
      step = performance.now()
    })
    buildMs += Math.round(performance.now() - step)
    await nextFrame()
    await waitTurn(pointerDown)
    const compileStart = performance.now()
    await compileInterior(built.content)
    const compileMs = Math.round(performance.now() - compileStart)
    await nextFrame()
    const uploadStart = performance.now()
    const renderer = window.__twinRenderer
    const camera = window.__twinCamera
    const scene = window.__twinScene
    let meshes = 0
    if (renderer && camera && scene) {
      meshes = await uploadMeshes(renderer, built.content, pointerDown)
      markInteriorUploaded(floorId)
    }
    noteFloor(floorId, {
      parseMs: parseMsByFloor.get(floorId) ?? 0,
      buildMs,
      compileMs,
      uploadMs: Math.round(performance.now() - uploadStart),
      meshes,
      uploaded: peekPrebuiltInterior(floorId)?.uploaded === true,
    })
  }
  notePrewarm({ done: true })
}
