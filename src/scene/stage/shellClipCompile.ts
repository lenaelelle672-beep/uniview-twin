import {
  BoxGeometry,
  Group,
  Mesh,
  Plane,
  Vector3,
  type Camera,
  type Material,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three'
import {
  baseMaterial,
  curtainMaterial,
  eaveMaterial,
  finMaterial,
  grilleMaterial,
  jointMaterial,
  solidMaterial,
  stoneMaterial,
} from '../materials'

const retainedClipObjects: Object3D[] = []
let shellClipTask: Promise<boolean> | null = null
let shellClipDone = false

const SHELL_AFTER_FIRST_MS = 2600
/**
 * 早窗一开就连续编。逐个再等槽会把后一份推到首帧 +2.6s，长编译的结束时刻落进 D263。
 * 只在 +0.5s 点击余量之后开工，并在首帧 +1.7s 后停手，给长编译留出在 +2s 前结束的时间。
 */
const CLICK_OFFSETS_MS = [500, 1500, 3000]

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

function inClickBand(now: number): boolean {
  const readyAt = window.__twinReadyAt
  if (readyAt == null) return false
  const rel = now - readyAt
  return CLICK_OFFSETS_MS.some((offset) => rel >= offset - 160 && rel <= offset + 60)
}

/** 早窗错过时才退到首帧 +2.6s。调用方在爆发期内不再逐份等待。 */
async function waitShellSlot(): Promise<'early' | 'late'> {
  for (;;) {
    const first = window.__twinFirstFrameAt
    const readyAt = window.__twinReadyAt
    const now = performance.now()
    const rel = readyAt == null ? null : now - readyAt
    const clicking = inClickBand(now)
    const early =
      first != null &&
      rel != null &&
      rel >= 620 &&
      now < first + 1600 &&
      !clicking &&
      window.__twinView !== 'floor'
    const late = first != null && now >= first + SHELL_AFTER_FIRST_MS && !clicking && window.__twinView !== 'floor'
    if (early) return 'early'
    if (late) return 'late'
    await nextFrame()
  }
}

function shellBurstOpen(now: number): boolean {
  const first = window.__twinFirstFrameAt
  if (first == null || window.__twinView === 'floor' || inClickBand(now)) return false
  return now < first + 1700
}

function probeEnabled(): boolean {
  if (typeof location === 'undefined') return false
  const params = new URLSearchParams(location.search)
  return params.get('keepDrawingBuffer') === '1' || params.get('probe') === '1'
}

export async function compileWithScene(
  renderer: WebGLRenderer,
  object: Object3D,
  camera: Camera,
  mainScene: Scene,
): Promise<'composer' | 'canvas'> {
  const previous = renderer.getRenderTarget()
  const input = window.__twinComposerInput
  const useComposer = Boolean(window.__twinComposerLive && input)
  if (useComposer && input) renderer.setRenderTarget(input)
  let pending: Promise<unknown> | undefined
  try {
    const asyncCompile = renderer.compileAsync?.bind(renderer)
    if (typeof asyncCompile === 'function') pending = asyncCompile(object, camera, mainScene)
    else renderer.compile(object, camera, mainScene)
  } finally {
    renderer.setRenderTarget(previous)
  }
  if (pending) await pending
  return useComposer ? 'composer' : 'canvas'
}

function markShellClip() {
  shellClipDone = true
  if (window.__twinGlyphPreload) window.__twinGlyphPreload.shellClip = true
}

/**
 * 进层会给外壳的原材质挂一个裁切平面。克隆不带 onBeforeCompile，
 * 编出来的是另一套程序。这里直接在原材质上编 1 个平面，再立刻还原，
 * 程序留在材质自己的缓存里。
 */
export function compileClippedShellMaterials(): Promise<boolean> {
  if (shellClipDone || window.__twinGlyphPreload?.shellClip) return Promise.resolve(true)
  if (!shellClipTask) {
    shellClipTask = compileClippedShellMaterialsNow().catch(() => {
      shellClipTask = null
      return false
    })
  }
  return shellClipTask
}

async function compileClippedShellMaterialsNow(): Promise<boolean> {
  const renderer = window.__twinRenderer
  const camera = window.__twinCamera
  const mainScene = window.__twinScene
  if (!renderer || !camera || !mainScene || window.__twinView === 'floor') {
    shellClipTask = null
    return false
  }
  const plane = new Plane(new Vector3(0, -1, 0), 1)
  const planes = [plane]
  const sources: Material[] = [
    curtainMaterial,
    jointMaterial,
    solidMaterial,
    grilleMaterial,
    finMaterial,
    stoneMaterial,
    eaveMaterial,
    baseMaterial,
  ]
  mainScene.traverse((object) => {
    const mesh = object as Mesh & { customDepthMaterial?: Material }
    const list = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []
    if (!list.some((item) => item?.name === 'east_grille')) return
    for (const item of list) if (item) sources.push(item)
    if (mesh.customDepthMaterial) sources.push(mesh.customDepthMaterial)
  })
  const slot = await waitShellSlot()
  if (window.__twinView === 'floor' || !window.__twinRenderer) {
    shellClipTask = null
    return false
  }
  const unique = [...new Set(sources)]
  const clippingWas = renderer.localClippingEnabled
  const geo = new BoxGeometry(1, 1, 1)
  const group = new Group()
  // 先编铝翅再编幕墙。幕墙的 onBeforeCompile 会让排在它后面的材质编不到裁切变体。
  const rank = (name: string) => (name === '铝翅' ? 0 : name === '幕墙' ? 1 : 2)
  const ordered = [...unique].sort((a, b) => rank(a.name) - rank(b.name))
  let burst = slot === 'early'
  const timing: { slot: string; start: number; rows: Array<{ name: string; at: number; ms: number }> } = {
    slot,
    start: performance.now(),
    rows: [],
  }
  for (const source of ordered) {
    const now = performance.now()
    if (burst && !shellBurstOpen(now)) burst = false
    if (!burst) await waitShellSlot()
    if (window.__twinView === 'floor' || !window.__twinRenderer) break
    const prevPlanes = source.clippingPlanes
    const prevShadows = source.clipShadows
    source.clippingPlanes = planes
    source.clipShadows = true
    source.needsUpdate = true
    const mesh = new Mesh(geo, source)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    group.add(mesh)
    retainedClipObjects.push(mesh)
    renderer.localClippingEnabled = true
    let pending: Promise<unknown> | null = null
    const compileStart = performance.now()
    try {
      // r186 对整组 compile 不会给已在场景里的材质记下裁切变体，必须逐个编。
      if (typeof renderer.compileAsync === 'function') pending = renderer.compileAsync(mesh, camera, mainScene)
      else renderer.compile(mesh, camera, mainScene)
    } finally {
      source.clippingPlanes = prevPlanes
      source.clipShadows = prevShadows
      source.needsUpdate = true
      renderer.localClippingEnabled = clippingWas
    }
    if (pending) await pending
    timing.rows.push({
      name: source.name || 'material',
      at: Math.round(compileStart),
      ms: Math.round(performance.now() - compileStart),
    })
    if (!burst) await nextFrame()
  }
  const compiled = compileWithScene(renderer, group, camera, mainScene)
  await compiled
  markShellClip()
  if (probeEnabled()) {
    window.__twinInteriorPrewarm = {
      ...(window.__twinInteriorPrewarm ?? { floors: {}, done: false }),
      shell: { planes: planes.length, at: performance.now(), scene: true, timing },
    }
  }
  return true
}
