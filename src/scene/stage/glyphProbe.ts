import { ROOM_LABEL_FONT } from './roomLabels'

/** 首批小，先付字体解析。 */
export const GLYPH_FIRST_BATCH = 8
/** 之后每 idle 回调 24 字（20–30）。 */
export const GLYPH_BATCH = 24

const seen = new Set<string>()
const newOnEntry: Record<string, number> = {}
let hookInstalled = false
let preloadFontFn: ((options: { font?: string; characters?: string }, cb: () => void) => void) | null = null

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

export function unseenGlyphs(characters: string): string {
  return Array.from(characters)
    .filter((char) => char && !seen.has(char))
    .join('')
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
  }
}

export async function preloadLabelChars(characters: string, source: string): Promise<number> {
  if (!characters) return 0
  installSdfAtlasHook()
  if (!preloadFontFn) {
    const mod = await import('troika-three-text')
    preloadFontFn = mod.preloadFont
  }
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
