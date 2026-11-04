import { drawableCount, revealableMesh, revealCount, type RangeGeometry, type RangeMesh, type RenderHook } from './plan'

/**
 * setDrawRange 的薄封装。只在这块网格自己的那次绘制里收窄 drawRange，画完立刻放回。
 * 帧与帧之间几何上一直是原值：three-mesh-bvh 建树、clone、线框、导出、射线和预构建缓存都看不到半截。
 * 阴影图走 onBeforeShadow，不经过这里。
 */

interface Entry {
  mesh: RangeMesh
  geometry: RangeGeometry
  total: number
  shown: number
  drawing: boolean
  savedStart: number
  savedCount: number
  ownBefore: boolean
  ownAfter: boolean
  prevBefore: RenderHook | undefined
  prevAfter: RenderHook | undefined
  before: RenderHook
  after: RenderHook
}

export interface DrawRangeRevealOptions {
  /**
   * 绘制时问一次：下一帧是否已经排上。这时同一帧的帧回调都跑完了。
   * 没排上就这一帧画全，屏幕上不会停着半截。不传当作已排上。
   */
  nextFrame?: () => boolean
  /** 某一帧因为没有下一帧而画全后，在这一帧之后（微任务）调用一次。 */
  onStall?: () => void
}

export interface DrawRangeReveal {
  /** 挂上绘制钩子，起点是一个三角形也不画。返回实际接管的网格数。 */
  begin: (meshes: readonly RangeMesh[]) => number
  /** 这一帧的进度 0～1。只记下数目，真正的 setDrawRange 在绘制钩子里。 */
  frame: (progress: number) => void
  /** 摘钩子，原来的 onBeforeRender / onAfterRender 原样放回。可重复调用。 */
  end: () => void
  active: () => boolean
  stalled: () => boolean
  meshes: () => RangeMesh[]
  shown: () => number[]
}

function own(mesh: RangeMesh, key: 'onBeforeRender' | 'onAfterRender'): boolean {
  return Object.prototype.hasOwnProperty.call(mesh, key)
}

function restoreHook(mesh: RangeMesh, key: 'onBeforeRender' | 'onAfterRender', mine: RenderHook, had: boolean, prev: RenderHook | undefined) {
  // 显形期间别人换了钩子，就留着别人的。
  if (mesh[key] !== mine) return
  if (had) mesh[key] = prev
  else delete mesh[key]
}

function release(entry: Entry) {
  if (entry.drawing) {
    entry.geometry.setDrawRange(entry.savedStart, entry.savedCount)
    entry.drawing = false
  }
  restoreHook(entry.mesh, 'onBeforeRender', entry.before, entry.ownBefore, entry.prevBefore)
  restoreHook(entry.mesh, 'onAfterRender', entry.after, entry.ownAfter, entry.prevAfter)
}

export function createDrawRangeReveal(options: DrawRangeRevealOptions = {}): DrawRangeReveal {
  let entries: Entry[] = []
  let stalled = false

  const stall = () => {
    if (stalled) return
    stalled = true
    const onStall = options.onStall
    if (onStall) queueMicrotask(onStall)
  }

  /** 这次绘制画到哪。下一帧没排上就画全。 */
  const limit = (entry: Entry, count: number): number => {
    if (!stalled && options.nextFrame && !options.nextFrame()) stall()
    return stalled ? count : Math.min(count, entry.shown)
  }

  const attach = (mesh: RangeMesh, geometry: RangeGeometry): Entry => {
    const entry = {
      mesh,
      geometry,
      total: drawableCount(geometry),
      shown: 0,
      drawing: false,
      savedStart: 0,
      savedCount: Infinity,
      ownBefore: own(mesh, 'onBeforeRender'),
      ownAfter: own(mesh, 'onAfterRender'),
      prevBefore: mesh.onBeforeRender,
      prevAfter: mesh.onAfterRender,
    } as Entry
    // three 的签名是 (renderer, scene, camera, geometry, material, group)。多材质按 group 各调一次。
    entry.before = function (this: unknown, ...args: unknown[]) {
      entry.prevBefore?.apply(this, args)
      if (args[3] !== entry.geometry || entry.drawing) return
      const range = entry.geometry.drawRange
      entry.savedStart = range.start
      entry.savedCount = range.count
      entry.drawing = true
      entry.geometry.setDrawRange(range.start, limit(entry, range.count))
    }
    entry.after = function (this: unknown, ...args: unknown[]) {
      if (entry.drawing && args[3] === entry.geometry) {
        entry.drawing = false
        entry.geometry.setDrawRange(entry.savedStart, entry.savedCount)
      }
      entry.prevAfter?.apply(this, args)
    }
    mesh.onBeforeRender = entry.before
    mesh.onAfterRender = entry.after
    return entry
  }

  const end = () => {
    const list = entries
    entries = []
    for (const entry of list) release(entry)
  }

  return {
    begin(meshes) {
      end()
      stalled = false
      for (const mesh of meshes) {
        if (!revealableMesh(mesh)) continue
        const geometry = mesh.geometry
        if (entries.some((entry) => entry.geometry === geometry)) continue
        entries.push(attach(mesh, geometry))
      }
      return entries.length
    },
    frame(progress) {
      for (const entry of entries) entry.shown = revealCount(entry.total, progress)
    },
    end,
    active: () => entries.length > 0,
    stalled: () => stalled,
    meshes: () => entries.map((entry) => entry.mesh),
    shown: () => entries.map((entry) => entry.shown),
  }
}
