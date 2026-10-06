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

const seen = new Set<string>()
const newOnEntry: Record<string, number> = {}
let hookInstalled = false
let pauseHooked = false
let pointerDown = false
let preloadFontFn: ((options: { font?: string; characters?: string }, cb: () => void) => void) | null = null
let getTextRenderInfoFn:
  | ((
      args: { font?: string; text?: string },
      cb: (info: { sdfTexture?: { image?: { width?: number; height?: number } } }) => void,
    ) => void)
  | null = null

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
  writeProbe()
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
  }
}

async function loadTroika() {
  if (preloadFontFn && getTextRenderInfoFn) return
  const { disableTroikaCdnFallback } = await import('./disableTroikaCdn')
  disableTroikaCdnFallback()
  const mod = await import('troika-three-text')
  preloadFontFn = mod.preloadFont
  getTextRenderInfoFn = (
    mod as unknown as {
      getTextRenderInfo: typeof getTextRenderInfoFn
    }
  ).getTextRenderInfo
}

export async function warmupFontParse(): Promise<{ ms: number; atlasHeight: number | null; glyphs: number }> {
  installSdfAtlasHook()
  installAtlasCanvasHook()
  await loadTroika()
  const started = performance.now()
  await new Promise<void>((resolve) => {
    getTextRenderInfoFn?.(
      { font: ROOM_LABEL_FONT, text: GLYPH_WARMUP_SPACE },
      (info) => {
        const tex = info.sdfTexture as { image?: { width?: number; height?: number }; source?: { data?: { width?: number; height?: number } } } | undefined
        const img = tex?.image ?? tex?.source?.data
        const height = img?.height
        const width = img?.width
        if (window.__twinGlyphPreload) {
          if (typeof height === 'number') window.__twinGlyphPreload.atlasHeight = height
          if (typeof width === 'number') window.__twinGlyphPreload.atlasWidth = width
        }
        resolve()
      },
    )
  })
  noteGlyphChars('warmup:space', GLYPH_WARMUP_SPACE)
  return {
    ms: performance.now() - started,
    atlasHeight: window.__twinGlyphPreload?.atlasHeight ?? null,
    glyphs: 1,
  }
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
