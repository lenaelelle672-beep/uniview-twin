import {
  BoxGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  type Camera,
  type Scene,
  type Texture,
  type WebGLRenderer,
} from 'three'
import { ROOM_LABEL_FONT, roomLabelColors, roomLabelOutlineWidth } from './roomLabels'

/** 首批小，字体解析已拆到 warmup。 */
export const GLYPH_FIRST_BATCH = 4
/** 之后每 idle 回调最多 60 字，再按 timeRemaining / 0.2ms 切片。 */
export const GLYPH_BATCH = 60
/** 切片预算：每个字形大约 0.2 ms。 */
export const GLYPH_MS_PER = 0.2
/** 字体解析用空格；研究提示：不应生成 SDF，需实测。 */
export const GLYPH_WARMUP_SPACE = ' '
/** 第二段 warmup：一个 ASCII，单独付 webgl-sdf-generator 首次自检。 */
export const GLYPH_WARMUP_GLYPH = 'x'
/** D266.1：第一次 preloadFont 不早于首帧 + 5s。 */
export const GLYPH_PRELOAD_AFTER_FIRST_MS = 5000
/** 总览空闲豁免：空格回调所在帧。 */
export const GLYPH_SPACE_FRAME_MAX_MS = 60
/** 总览空闲豁免：initTexture 所在帧。 */
export const GLYPH_UPLOAD_FRAME_MAX_MS = 100

const seen = new Set<string>()
const newOnEntry: Record<string, number> = {}
let hookInstalled = false
let pauseHooked = false
let pointerDown = false
type SdfTexture = Texture
type PreloadCb = (info?: { sdfTexture?: Texture }) => void
let preloadFontFn: ((options: { font?: string; characters?: string; sdfGlyphSize?: number }, cb: PreloadCb) => void) | null = null
let sdfTexture: Texture | null = null
let texHooked = false

export function chunkGlyphs(characters: string, first = GLYPH_FIRST_BATCH, next = GLYPH_BATCH): string[] {
  const unique = Array.from(new Set(Array.from(characters)))
  if (unique.length === 0) return []
  const out: string[] = []
  out.push(unique.slice(0, first).join(''))
  for (let i = first; i < unique.length; i += next) {
    out.push(unique.slice(i, i + next).join(''))
  }
  return out.filter((chunk) => chunk.length > 0)
}

export function takeGlyphBudget(
  characters: string,
  deadline: { timeRemaining: () => number },
  max = GLYPH_BATCH,
): string {
  if (!characters) return ''
  const remaining = deadline.timeRemaining()
  if (!(remaining > 0) && max > 0) return characters.slice(0, 1)
  const n = Math.max(1, Math.min(max, characters.length, Math.floor(remaining / GLYPH_MS_PER)))
  return characters.slice(0, n)
}

export function unseenGlyphs(characters: string): string {
  const local = new Set<string>()
  const out: string[] = []
  for (const char of characters) {
    if (!char || seen.has(char) || local.has(char)) continue
    local.add(char)
    out.push(char)
  }
  return out.join('')
}

export function noteGlyphChars(source: string, characters: string): number {
  let neu = 0
  for (const char of characters) {
    if (!char || seen.has(char)) continue
    seen.add(char)
    neu += 1
  }
  if (neu > 0) newOnEntry[source] = (newOnEntry[source] ?? 0) + neu
  else if (newOnEntry[source] == null) newOnEntry[source] = 0
  writeProbe()
  return neu
}

export function glyphSeenCount(): number {
  return seen.size
}

export function resetGlyphProbe() {
  seen.clear()
  for (const key of Object.keys(newOnEntry)) delete newOnEntry[key]
  hookInstalled = false
  pointerDown = false
  sdfTexture = null
  writeProbe()
}

export function setGlyphPointerDown(next: boolean) {
  pointerDown = next
}

export function postfxCompiled(): boolean {
  if (typeof window === 'undefined') return false
  if (window.__twinGpu?.tier === 'performance') return true
  return window.__twinWarmup != null
}

export function glyphPreloadStartReady(): boolean {
  if (typeof window === 'undefined') return false
  const first = window.__twinFirstFrameAt
  if (first == null || performance.now() < first + GLYPH_PRELOAD_AFTER_FIRST_MS) return false
  if (window.__twinTextRuntimeAt == null) return false
  return postfxCompiled()
}

export function overviewIdleBlocked(): boolean {
  if (pointerDown) return true
  if (typeof window === 'undefined') return false
  if (window.__twinView !== 'building') return true
  if (window.__twinSchedule?.holds?.motion) return true
  const moved = window.__twinCameraMoveAt
  if (typeof moved === 'number' && performance.now() - moved < 240) return true
  return false
}

export function preloadPauseReason(): 'pointer' | 'motion' | 'floor' | null {
  if (!overviewIdleBlocked()) return null
  if (pointerDown) return 'pointer'
  if (typeof window !== 'undefined' && window.__twinView !== 'building') return 'floor'
  return 'motion'
}

export function notePreloadPause() {
  if (typeof window === 'undefined') return
  const reason = preloadPauseReason()
  const prev = window.__twinGlyphPreload?.pauseCounts ?? { pointer: 0, motion: 0, floor: 0 }
  const next = { ...prev }
  if (reason) next[reason] += 1
  window.__twinGlyphPreload = {
    ...(window.__twinGlyphPreload ?? {
      batchSize: GLYPH_BATCH,
      firstBatchSize: GLYPH_FIRST_BATCH,
      batches: [],
      done: false,
      atlasGrows: [],
    }),
    paused: Boolean(reason),
    pauseReason: reason,
    pauseCounts: next,
  }
}

export function getSdfTexture(): SdfTexture | null {
  return sdfTexture
}

function noteSdfTexture(tex: Texture | undefined) {
  if (!tex) return
  sdfTexture = tex
  const img = (tex.image ?? tex.source?.data) as { width?: number; height?: number } | undefined
  if (window.__twinGlyphPreload) {
    if (typeof img?.height === 'number') window.__twinGlyphPreload.atlasHeight = img.height
    if (typeof img?.width === 'number') window.__twinGlyphPreload.atlasWidth = img.width
    window.__twinGlyphPreload.sdfReady = true
  }
}

/** 与其它 __twin 探针一样：只认启动 URL 的 keepDrawingBuffer=1（或 probe=1）。默认页不改 prototype。 */
export function glyphTimingProbeEnabled(search = typeof location === 'undefined' ? '' : location.search): boolean {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  return params.get('keepDrawingBuffer') === '1' || params.get('probe') === '1'
}

function installSpaceSplitHooks() {
  let canvasMs = 0
  let sdfMs = 0
  let compileCount = 0
  const doc = typeof document !== 'undefined' ? document : null
  const origCreate = doc?.createElement.bind(document)
  const proto = typeof HTMLCanvasElement !== 'undefined' ? HTMLCanvasElement.prototype : null
  const origGet = proto?.getContext
  if (doc && origCreate) {
    document.createElement = ((tag: string, options?: ElementCreationOptions) => {
      const el = origCreate(tag, options)
      if (String(tag).toLowerCase() === 'canvas') {
        const t0 = performance.now()
        queueMicrotask(() => {
          const canvas = el as HTMLCanvasElement
          if (canvas.width === 2048) canvasMs = Math.round(performance.now() - t0)
        })
      }
      return el
    }) as typeof document.createElement
  }
  if (proto && origGet) {
    proto.getContext = function (this: HTMLCanvasElement, type: string, attrs?: unknown) {
      const t0 = performance.now()
      const ctx = origGet.call(this, type, attrs as never)
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
        sdfMs += performance.now() - t0
        const gl = ctx as WebGLRenderingContext | null
        if (gl && !(gl as WebGLRenderingContext & { __twinSpaceHook?: boolean }).__twinSpaceHook) {
          ;(gl as WebGLRenderingContext & { __twinSpaceHook?: boolean }).__twinSpaceHook = true
          const origC = gl.compileShader.bind(gl)
          gl.compileShader = (shader) => {
            compileCount += 1
            const c0 = performance.now()
            const result = origC(shader)
            sdfMs += performance.now() - c0
            return result
          }
        }
      }
      return ctx
    } as typeof proto.getContext
  }
  return {
    finish() {
      if (doc && origCreate) document.createElement = origCreate
      if (proto && origGet) proto.getContext = origGet
      return { canvasMs, sdfMs: Math.round(sdfMs), compileCount }
    },
  }
}

export function installSdfAtlasHook() {
  if (hookInstalled || typeof console === 'undefined') return
  hookInstalled = true
  const orig = console.info.bind(console)
  console.info = (...args: unknown[]) => {
    const text = args.map((item) => (typeof item === 'string' ? item : '')).join(' ')
    if (text.includes('Increasing SDF texture size')) {
      const grows = window.__twinGlyphPreload?.atlasGrows ?? []
      grows.push({
        at: performance.now(),
        msg: text,
        floorId: window.__twinSelected ?? null,
        seen: seen.size,
      })
      if (window.__twinGlyphPreload) window.__twinGlyphPreload.atlasGrows = grows
    }
    orig(...args)
  }
}

export function installAtlasCanvasHook() {
  if (typeof document === 'undefined') return
  const doc = document as Document & { __twinAtlasHook?: boolean }
  if (doc.__twinAtlasHook) return
  doc.__twinAtlasHook = true
  const orig = document.createElement.bind(document)
  document.createElement = ((tag: string, options?: ElementCreationOptions) => {
    const el = orig(tag, options)
    if (String(tag).toLowerCase() === 'canvas') {
      queueMicrotask(() => {
        const canvas = el as HTMLCanvasElement
        if (canvas.width === 2048 && (canvas.height === 128 || canvas.height === 256 || canvas.height === 512)) {
          if (window.__twinGlyphPreload) window.__twinGlyphPreload.atlasHeight = canvas.height
        }
      })
    }
    return el
  }) as typeof document.createElement
}

export function glyphPreloadBlocked(): boolean {
  return overviewIdleBlocked()
}

export function installGlyphPauseHooks() {
  if (pauseHooked || typeof window === 'undefined') return
  pauseHooked = true
  const down = () => {
    pointerDown = true
    writeProbe()
  }
  const up = () => {
    pointerDown = false
    writeProbe()
  }
  window.addEventListener('pointerdown', down, true)
  window.addEventListener('pointerup', up, true)
  window.addEventListener('pointercancel', up, true)
}

function writeProbe() {
  if (typeof window === 'undefined') return
  window.__twinGlyphPreload = {
    ...(window.__twinGlyphPreload ?? {
      batchSize: GLYPH_BATCH,
      firstBatchSize: GLYPH_FIRST_BATCH,
      batches: [],
      done: false,
      atlasGrows: [],
    }),
    unique: seen.size,
    newOnEntry: { ...newOnEntry },
    paused: glyphPreloadBlocked(),
    sdfReady: Boolean(sdfTexture),
    gate: {
      firstAt: window.__twinFirstFrameAt ?? null,
      textAt: window.__twinTextRuntimeAt ?? null,
      warmup: postfxCompiled(),
      ready: glyphPreloadStartReady(),
    },
  }
}

let textCtor: (typeof import('./disableTroikaCdn'))['Text'] | null = null
let batchedCtor: (typeof import('./disableTroikaCdn'))['BatchedText'] | null = null

async function loadTroika() {
  if (preloadFontFn && textCtor && batchedCtor) return
  const mod = await import('./disableTroikaCdn')
  mod.disableTroikaCdnFallback()
  preloadFontFn = mod.preloadFont
  textCtor = mod.Text
  batchedCtor = mod.BatchedText
}

function currentPrograms(renderer?: WebGLRenderer | null): number {
  return renderer?.info.programs?.length ?? window.__twinMemory?.programs ?? 0
}

function noteProgramLog(label: string, renderer?: WebGLRenderer | null) {
  if (typeof window === 'undefined') return currentPrograms(renderer)
  const programs = currentPrograms(renderer)
  const log = (window.__twinProgramLog ??= [])
  log.push({
    at: performance.now(),
    label,
    programs,
    view: window.__twinView,
    floor: window.__twinSelected ?? null,
  })
  if (log.length > 80) log.splice(0, log.length - 80)
  return programs
}

function labelQuality(): 'perf' | 'balanced' {
  return window.__twinGpu?.tier === 'performance' ? 'perf' : 'balanced'
}

async function compileWithScene(
  renderer: WebGLRenderer,
  object: Group | Mesh | InstancedMesh,
  camera: Camera,
  mainScene: Scene,
): Promise<'composer' | 'canvas'> {
  const previous = renderer.getRenderTarget()
  const input = window.__twinComposerInput
  const useComposer = Boolean(window.__twinComposerLive && input)
  if (useComposer && input) renderer.setRenderTarget(input)
  try {
    const asyncCompile = renderer.compileAsync?.bind(renderer)
    if (typeof asyncCompile === 'function') await asyncCompile(object, camera, mainScene)
    else renderer.compile(object, camera, mainScene)
  } finally {
    renderer.setRenderTarget(previous)
  }
  return useComposer ? 'composer' : 'canvas'
}

function classifyTroikaSource(source: string | undefined): { label: boolean; batched: boolean } {
  if (!source) return { label: false, batched: false }
  const label = source.includes('uTroikaSDFTexture')
  return { label, batched: label && source.includes('uTroikaMatricesTexture') }
}

export function installShaderCompileHook(renderer?: WebGLRenderer | null) {
  const gl = renderer ?? window.__twinRenderer
  if (!gl) return
  const ctx = gl.getContext() as WebGLRenderingContext & {
    __twinShaderHook?: boolean
    shaderSource: (shader: WebGLShader, source: string) => void
    attachShader: (program: WebGLProgram, shader: WebGLShader) => void
    compileShader: (shader: WebGLShader) => void
    linkProgram: (program: WebGLProgram) => void
  }
  if (!ctx || ctx.__twinShaderHook) return
  ctx.__twinShaderHook = true
  const sources = new WeakMap<WebGLShader, string>()
  const attached = new WeakMap<WebGLProgram, WebGLShader[]>()
  const origSource = ctx.shaderSource.bind(ctx)
  const origAttach = ctx.attachShader.bind(ctx)
  const origCompile = ctx.compileShader.bind(ctx)
  const origLink = ctx.linkProgram.bind(ctx)
  ctx.shaderSource = function (shader: WebGLShader, source: string) {
    sources.set(shader, source)
    origSource(shader, source)
  }
  ctx.attachShader = function (program: WebGLProgram, shader: WebGLShader) {
    const list = attached.get(program) ?? []
    list.push(shader)
    attached.set(program, list)
    origAttach(program, shader)
  }
  ctx.compileShader = function (shader: WebGLShader) {
    const started = performance.now()
    origCompile(shader)
    const kind = classifyTroikaSource(sources.get(shader))
    const rows = (window.__twinShaderCompiles ??= [])
    rows.push({
      kind: 'compileShader',
      at: started,
      ms: performance.now() - started,
      view: window.__twinView,
      floor: window.__twinSelected ?? null,
      label: kind.label,
      batched: kind.batched,
    })
    if (rows.length > 400) rows.splice(0, rows.length - 400)
  }
  ctx.linkProgram = function (program: WebGLProgram) {
    const started = performance.now()
    origLink(program)
    const shaders = attached.get(program) ?? []
    let label = false
    let batched = false
    for (const shader of shaders) {
      const kind = classifyTroikaSource(sources.get(shader))
      if (kind.label) label = true
      if (kind.batched) batched = true
    }
    const rows = (window.__twinShaderCompiles ??= [])
    rows.push({
      kind: 'linkProgram',
      at: started,
      ms: performance.now() - started,
      view: window.__twinView,
      floor: window.__twinSelected ?? null,
      label,
      batched,
    })
    if (rows.length > 400) rows.splice(0, rows.length - 400)
  }
}

export function snapshotProgramCache(renderer?: WebGLRenderer | null): Array<{ name: string; cacheKey: string }> {
  const gl = renderer ?? window.__twinRenderer
  const programs = gl?.info.programs ?? []
  return programs.map((program) => ({
    name: (program as { name?: string }).name ?? '',
    cacheKey: String((program as { cacheKey?: string }).cacheKey ?? ''),
  }))
}

export function diffProgramCacheKeys(
  before: Array<{ name: string; cacheKey: string }>,
  after: Array<{ name: string; cacheKey: string }>,
): Array<{ name: string; cacheKey: string; changed?: string[] }> {
  const prev = new Set(before.map((row) => row.cacheKey))
  const added = after.filter((row) => !prev.has(row.cacheKey))
  return added.map((row) => {
    const near = before.find((item) => item.name === row.name)
    if (!near) return row
    const a = near.cacheKey.split(',')
    const b = row.cacheKey.split(',')
    const changed: string[] = []
    const n = Math.max(a.length, b.length)
    for (let i = 0; i < n; i += 1) {
      if (a[i] !== b[i]) changed.push(`${i}:${a[i] ?? ''}→${b[i] ?? ''}`)
    }
    return { ...row, changed }
  })
}

export function installSetSizeHook(renderer?: WebGLRenderer | null) {
  const gl = renderer ?? window.__twinRenderer
  if (!gl) return
  const tagged = gl as WebGLRenderer & { __twinSetSizeHook?: boolean }
  if (tagged.__twinSetSizeHook) return
  tagged.__twinSetSizeHook = true
  const origSize = gl.setSize.bind(gl)
  const origDpr = gl.setPixelRatio.bind(gl)
  gl.setSize = ((width: number, height: number, updateStyle?: boolean) => {
    const rows = (window.__twinSetSize ??= [])
    rows.push({
      at: performance.now(),
      w: width,
      h: height,
      updateStyle: updateStyle !== false,
      view: window.__twinView,
      floor: window.__twinSelected ?? null,
    })
    if (rows.length > 40) rows.splice(0, rows.length - 40)
    return origSize(width, height, updateStyle)
  }) as typeof gl.setSize
  gl.setPixelRatio = ((value: number) => {
    const rows = (window.__twinSetPixelRatio ??= [])
    rows.push({
      at: performance.now(),
      value,
      view: window.__twinView,
      floor: window.__twinSelected ?? null,
    })
    if (rows.length > 40) rows.splice(0, rows.length - 40)
    return origDpr(value)
  }) as typeof gl.setPixelRatio
}

export function installTexImage2DHook(renderer?: WebGLRenderer | null) {
  const gl = renderer ?? window.__twinRenderer
  installShaderCompileHook(gl)
  installSetSizeHook(gl)
  if (!gl || texHooked) return
  const ctx = gl.getContext() as WebGLRenderingContext & { __twinTexHook?: boolean; texImage2D: (...args: unknown[]) => void }
  if (!ctx || ctx.__twinTexHook) return
  ctx.__twinTexHook = true
  texHooked = true
  const orig = ctx.texImage2D.bind(ctx)
  ctx.texImage2D = function (...args: unknown[]) {
    const source = args.find((item) => item && typeof item === 'object' && 'width' in item && 'height' in item) as
      | { width?: number; height?: number }
      | undefined
    const started = performance.now()
    const result = orig(...args)
    const ms = performance.now() - started
    const width = source?.width
    const height = source?.height
    const atlas = width === 2048 && (height === 128 || height === 256 || height === 512)
    const probe = (window.__twinTexImage2D ??= { calls: [], uploadMs: 0 })
    probe.calls.push({
      at: started,
      ms,
      w: width,
      h: height,
      atlas,
      view: window.__twinView,
      floor: window.__twinSelected ?? null,
    })
    if (atlas) probe.uploadMs += ms
    return result
  }
}

export function startEntryFrameWatch() {
  if (typeof window === 'undefined') return
  const doc = document as Document & { __twinEntryWatch?: boolean }
  if (doc.__twinEntryWatch) return
  doc.__twinEntryWatch = true
  let last = performance.now()
  let lastTex = 0
  const tick = () => {
    const now = performance.now()
    const dt = now - last
    last = now
    const calls = window.__twinTexImage2D?.calls ?? []
    const fresh = calls.slice(lastTex)
    lastTex = calls.length
    const texMs = fresh.reduce((sum, row) => sum + row.ms, 0)
    if (dt >= 48 || texMs > 2) {
      const frames = (window.__twinEntryFrames ??= [])
      frames.push({
        at: now,
        dt: Math.round(dt),
        view: window.__twinView,
        floor: window.__twinSelected ?? null,
        rested: window.__twinCameraRested ?? null,
        packStep: window.__twinLabelPhases?.packStep,
        texMs: Math.round(texMs),
        texCalls: fresh.length,
        atlasTex: fresh.filter((row) => row.atlas).length,
        programs: window.__twinMemory?.programs ?? null,
        packMs: window.__twinLabelPackMs ?? null,
        labelReady: window.__twinLabelReadyAt ?? null,
      })
      if (frames.length > 120) frames.splice(0, frames.length - 120)
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

export async function warmupFontParse(): Promise<{
  ms: number
  atlasHeight: number | null
  glyphs: number
  deferred?: boolean
}> {
  if (glyphPreloadBlocked()) return { ms: 0, atlasHeight: null, glyphs: 0, deferred: true }
  installSdfAtlasHook()
  installAtlasCanvasHook()
  await loadTroika()
  if (glyphPreloadBlocked()) return { ms: 0, atlasHeight: null, glyphs: 0, deferred: true }
  const hooks = glyphTimingProbeEnabled() ? installSpaceSplitHooks() : { finish: () => ({ canvasMs: 0, sdfMs: 0, compileCount: 0 }) }
  const longTasks: Array<{ start: number; dur: number; name: string }> = []
  let observer: PerformanceObserver | null = null
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTasks.push({ start: entry.startTime, dur: entry.duration, name: entry.name })
        }
      })
      observer.observe({ type: 'longtask', buffered: true })
    } catch {
      observer = null
    }
  }
  let lastRaf = performance.now()
  let atlasFrameMs = 0
  let parseFrameMs = 0
  let phase: 'a' | 'b' | 'done' = 'a'
  let rafAlive = true
  const rafTick = () => {
    if (!rafAlive) return
    const now = performance.now()
    const dt = now - lastRaf
    lastRaf = now
    if (phase === 'a') atlasFrameMs = Math.max(atlasFrameMs, dt)
    else if (phase === 'b') parseFrameMs = Math.max(parseFrameMs, dt)
    requestAnimationFrame(rafTick)
  }
  requestAnimationFrame(rafTick)
  const started = performance.now()
  let afterMicro = 0
  const done = new Promise<void>((resolve) => {
    // 既定路线：preloadFont(' ')。(a) 微任务 / (b) XHR onload 本就是两段任务，不拆。
    preloadFontFn?.({ font: ROOM_LABEL_FONT, characters: GLYPH_WARMUP_SPACE }, (info) => {
      noteSdfTexture(info?.sdfTexture)
      resolve()
    })
  })
  await Promise.resolve()
  afterMicro = performance.now()
  phase = 'b'
  const atlasMs = afterMicro - started
  await done
  phase = 'done'
  rafAlive = false
  observer?.disconnect()
  const parseMs = performance.now() - afterMicro
  const hookSnap = hooks.finish()
  const atlasLong = longTasks.filter((row) => row.start < afterMicro && row.start + row.dur >= started)
  const parseLong = longTasks.filter((row) => row.start + row.dur > afterMicro && row.start < afterMicro + parseMs)
  noteGlyphChars('warmup:space', GLYPH_WARMUP_SPACE)
  if (window.__twinGlyphPreload) {
    window.__twinGlyphPreload.spaceCall = {
      ...(window.__twinGlyphPreload.spaceCall ?? { at: started, ms: 0, frameMs: 0 }),
      at: started,
      ms: Math.round(performance.now() - started),
      atlasMs: Math.round(atlasMs),
      parseMs: Math.round(parseMs),
      atlasFrameMs: Math.round(atlasFrameMs),
      parseFrameMs: Math.round(parseFrameMs),
      atlasLongTaskMs: atlasLong.length ? Math.round(Math.max(...atlasLong.map((row) => row.dur))) : 0,
      parseLongTaskMs: parseLong.length ? Math.round(Math.max(...parseLong.map((row) => row.dur))) : 0,
      longTasks: longTasks.map((row) => ({ start: Math.round(row.start), dur: Math.round(row.dur), name: row.name })),
      canvasMs: hookSnap.canvasMs,
      sdfMs: hookSnap.sdfMs,
      compileCount: hookSnap.compileCount,
    }
  }
  return {
    ms: performance.now() - started,
    atlasHeight: window.__twinGlyphPreload?.atlasHeight ?? null,
    glyphs: 1,
  }
}

export async function uploadSdfTexture(): Promise<{ ms: number; frameMs: number } | null> {
  if (glyphPreloadBlocked()) return null
  const renderer = window.__twinRenderer
  const tex = sdfTexture
  if (!renderer || !tex || window.__twinGlyphPreload?.uploaded) return null
  installTexImage2DHook(renderer)
  const started = performance.now()
  let frameMs = 0
  let last = performance.now()
  let alive = true
  const tick = () => {
    if (!alive) return
    const now = performance.now()
    frameMs = Math.max(frameMs, now - last)
    last = now
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  renderer.initTexture(tex)
  alive = false
  const ms = performance.now() - started
  if (window.__twinGlyphPreload) {
    window.__twinGlyphPreload.uploaded = true
    window.__twinGlyphPreload.upload = { at: started, ms: Math.round(ms), frameMs: Math.round(frameMs || ms) }
  }
  return { ms, frameMs: frameMs || ms }
}

export async function compileDummyLabelMaterial(): Promise<
  NonNullable<Window['__twinGlyphPreload']>['compile'] | null
> {
  const renderer = window.__twinRenderer
  const camera = window.__twinCamera
  const mainScene = window.__twinScene
  if (window.__twinGlyphPreload?.compile) return window.__twinGlyphPreload.compile
  if (glyphPreloadBlocked()) return null
  if (!renderer || !camera || !mainScene) return null
  if (window.__twinComposerLive && !window.__twinComposerInput) return null
  await loadTroika()
  const Text = textCtor!
  const BatchedText = batchedCtor!
  const started = performance.now()
  const palette = roomLabelColors(labelQuality())
  const fontSize = 0.78
  const outlineWidth = roomLabelOutlineWidth(fontSize)
  const text = new Text()
  text.font = ROOM_LABEL_FONT
  text.text = '字'
  text.fontSize = fontSize
  text.color = palette.color
  text.outlineWidth = outlineWidth
  text.outlineColor = palette.outline
  text.anchorX = 'center'
  text.anchorY = 'middle'
  try {
    await new Promise<void>((resolve) => {
      text.sync(() => resolve())
    })
    const batch = new BatchedText()
    batch.font = ROOM_LABEL_FONT
    batch.color = palette.color
    batch.anchorX = 'center'
    batch.anchorY = 'middle'
    batch.addText(text)
    await new Promise<void>((resolve) => {
      batch.sync(() => resolve())
    })
    const materials = Array.isArray(batch.material) ? batch.material : [batch.material]
    for (const material of materials) {
      if (!material) continue
      material.side = DoubleSide
      material.toneMapped = false
    }
    installShaderCompileHook(renderer)
    const programsBefore = noteProgramLog('label-compile:before', renderer)
    const target = await compileWithScene(renderer, batch, camera, mainScene)
    const programsAfter = noteProgramLog('label-compile:after', renderer)
    batch.dispose()
    text.dispose()
    const ms = performance.now() - started
    const row = {
      at: started,
      ms: Math.round(ms),
      frameMs: Math.round(ms),
      programsBefore,
      programsAfter,
      target,
    }
    if (window.__twinGlyphPreload) window.__twinGlyphPreload.compile = row
    return row
  } catch {
    text.dispose()
    return null
  }
}

export async function compileInteriorMaterials(): Promise<
  NonNullable<Window['__twinGlyphPreload']>['interiorCompile'] | null
> {
  const renderer = window.__twinRenderer
  const camera = window.__twinCamera
  const mainScene = window.__twinScene
  if (window.__twinGlyphPreload?.interiorCompile) return window.__twinGlyphPreload.interiorCompile
  if (glyphPreloadBlocked()) return null
  if (!renderer || !camera || !mainScene) return null
  if (window.__twinComposerLive && !window.__twinComposerInput) return null
  const mats = await import('./materials')
  const started = performance.now()
  const geo = new BoxGeometry(1, 1, 1)
  const group = new Group()
  const meshes: Array<Mesh | InstancedMesh> = []
  const shared = [
    mats.slabMaterial,
    mats.coreWallMaterial,
    mats.columnMaterial,
    mats.woodMaterial,
    mats.deskMaterial,
    mats.chairMaterial,
    mats.ceilingMaterial,
    mats.meetingGlassMaterial,
    mats.monitorMaterial,
  ]
  try {
    for (const material of shared) {
      const mesh = new Mesh(geo, material)
      const instanced = new InstancedMesh(geo, material, 1)
      mesh.castShadow = true
      mesh.receiveShadow = true
      instanced.castShadow = true
      instanced.receiveShadow = true
      group.add(mesh, instanced)
      meshes.push(mesh, instanced)
    }
    installShaderCompileHook(renderer)
    const programsBefore = noteProgramLog('interior-compile:before', renderer)
    await compileWithScene(renderer, group, camera, mainScene)
    const programsAfter = noteProgramLog('interior-compile:after', renderer)
    const ms = performance.now() - started
    const row = { at: started, ms: Math.round(ms), frameMs: Math.round(ms), programsBefore, programsAfter }
    if (window.__twinGlyphPreload) window.__twinGlyphPreload.interiorCompile = row
    return row
  } catch {
    return null
  } finally {
    for (const mesh of meshes) {
      group.remove(mesh)
      if (mesh instanceof InstancedMesh) mesh.dispose()
    }
    geo.dispose()
  }
}

export async function warmupTextMesh(): Promise<number> {
  installSdfAtlasHook()
  installAtlasCanvasHook()
  await loadTroika()
  const Text = textCtor!
  const started = performance.now()
  const text = new Text()
  text.font = ROOM_LABEL_FONT
  text.text = GLYPH_WARMUP_GLYPH
  text.fontSize = 1
  text.anchorX = 'center'
  text.anchorY = 'middle'
  await new Promise<void>((resolve) => {
    text.sync(() => {
      const img = (text as { textRenderInfo?: { sdfTexture?: { image?: { width?: number; height?: number }; source?: { data?: { width?: number; height?: number } } } } }).textRenderInfo
        ?.sdfTexture
      const canvas = img?.image ?? img?.source?.data
      if (window.__twinGlyphPreload && typeof canvas?.height === 'number') {
        window.__twinGlyphPreload.atlasHeight = canvas.height
        window.__twinGlyphPreload.atlasWidth = canvas.width
      }
      text.dispose()
      resolve()
    })
  })
  return performance.now() - started
}

export async function preloadLabelChars(characters: string, source: string): Promise<number> {
  if (!characters) return 0
  const neu = noteGlyphChars(source, characters)
  if (glyphPreloadBlocked()) return neu
  if (window.__twinGlyphPreload?.done) return neu
  installSdfAtlasHook()
  installAtlasCanvasHook()
  await loadTroika()
  await new Promise<void>((resolve) => {
    preloadFontFn!({ font: ROOM_LABEL_FONT, characters }, () => resolve())
  })
  return neu
}

export function scheduleIdleWork(work: (deadline: { timeRemaining: () => number }) => void): number {
  if (typeof requestIdleCallback === 'function') {
    return requestIdleCallback((deadline) => work(deadline), { timeout: 4000 })
  }
  return window.setTimeout(() => work({ timeRemaining: () => 8 }), 16) as unknown as number
}

export function cancelIdleWork(id: number) {
  if (typeof cancelIdleCallback === 'function') cancelIdleCallback(id)
  else window.clearTimeout(id)
}
