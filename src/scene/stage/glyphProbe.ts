import { DoubleSide, Scene, type Texture, type WebGLRenderer } from 'three'
import { ROOM_LABEL_FONT } from './roomLabels'

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
let preloadFontFn: ((options: { font?: string; characters?: string }, cb: PreloadCb) => void) | null = null
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
  if (pointerDown) return true
  if (typeof window === 'undefined') return false
  return window.__twinView === 'floor' && window.__twinCameraRested === false
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

export function installTexImage2DHook(renderer?: WebGLRenderer | null) {
  const gl = renderer ?? window.__twinRenderer
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

export async function warmupFontParse(): Promise<{ ms: number; atlasHeight: number | null; glyphs: number }> {
  installSdfAtlasHook()
  installAtlasCanvasHook()
  await loadTroika()
  const started = performance.now()
  await new Promise<void>((resolve) => {
    preloadFontFn?.({ font: ROOM_LABEL_FONT, characters: GLYPH_WARMUP_SPACE }, (info) => {
      noteSdfTexture(info?.sdfTexture)
      resolve()
    })
  })
  noteGlyphChars('warmup:space', GLYPH_WARMUP_SPACE)
  if (window.__twinGlyphPreload) {
    window.__twinGlyphPreload.spaceCall = {
      ...(window.__twinGlyphPreload.spaceCall ?? { at: started, ms: 0, frameMs: 0 }),
      at: started,
      ms: Math.round(performance.now() - started),
    }
  }
  return {
    ms: performance.now() - started,
    atlasHeight: window.__twinGlyphPreload?.atlasHeight ?? null,
    glyphs: 1,
  }
}

export async function uploadSdfTexture(): Promise<{ ms: number; frameMs: number } | null> {
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

export async function compileDummyLabelMaterial(): Promise<{ ms: number; frameMs: number } | null> {
  const renderer = window.__twinRenderer
  const camera = window.__twinCamera
  if (!renderer || !camera || window.__twinGlyphPreload?.compile) return window.__twinGlyphPreload?.compile ?? null
  await loadTroika()
  const Text = textCtor!
  const BatchedText = batchedCtor!
  const started = performance.now()
  const text = new Text()
  text.font = ROOM_LABEL_FONT
  text.text = '字'
  text.fontSize = 1
  text.outlineWidth = 0.04
  text.anchorX = 'center'
  text.anchorY = 'middle'
  try {
    await new Promise<void>((resolve) => {
      text.sync(() => resolve())
    })
    const batch = new BatchedText()
    batch.font = ROOM_LABEL_FONT
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
    const scene = new Scene()
    scene.add(batch)
    renderer.compile(scene, camera)
    scene.remove(batch)
    batch.dispose()
    text.dispose()
  } catch {
    text.dispose()
    return null
  }
  const ms = performance.now() - started
  const row = { at: started, ms: Math.round(ms), frameMs: Math.round(ms) }
  if (window.__twinGlyphPreload) window.__twinGlyphPreload.compile = row
  return row
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
  installSdfAtlasHook()
  installAtlasCanvasHook()
  await loadTroika()
  const neu = noteGlyphChars(source, characters)
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
