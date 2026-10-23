/**
 * T056：把当前三维画面嵌进告警报告。
 * 报告页没有画布。点「嵌入当前视图」后，先回到主场景截一帧，
 * PNG 留在这次会话的内存里，再跳回报告，用 img 显示。
 * 空白提示与 T049 相同。不改画布创建时的绘图缓冲开关。
 */
import { mainSearchFromReport } from '../alarms/reportQuery'
import { TWIN_NAVIGATE_EVENT } from './navigate'
import { publishReportShot, reportShotState } from './reportShotState'

export const REPORT_EMBEDDED_NOTE = '已嵌入当前视图'
export const REPORT_HOP_NOTE = '正在回到主场景截取画面'
export const REPORT_WORKING_NOTE = '正在截取画面'
export const REPORT_FAILED_NOTE = '截图没有完成'

const SCENE_WAIT_MS = 30_000

export interface ReportGl {
  domElement: {
    width: number
    height: number
    toBlob: (callback: (blob: Blob | null) => void, type?: string) => void
  }
}

export interface EmbedPorts {
  readGl: () => ReportGl | null
  invalidateFrame: () => Promise<void>
  readPng: (gl: ReportGl) => Promise<Blob | null>
  readSamples: (blob: Blob) => Promise<ReadonlyArray<readonly [number, number, number, number]>>
  looksBlank: (samples: ReadonlyArray<readonly [number, number, number, number]>) => boolean
  earlyNote: string
  emptyNote: string
  blankNote: string
  mainSearch: (search: string) => string
  go: (pathname: string, search: string) => void
  waitForGl: () => Promise<ReportGl | null>
  here: () => { pathname: string; search: string }
  createUrl?: (blob: Blob) => string
  revokeUrl?: (objectUrl: string) => void
}

export interface EmbedResult {
  ok: boolean
  message: string
  url: string | null
}

/** 回到主场景时保留画质、数据和已经写在地址上的 keepDrawingBuffer=1。告警筛选留在报告地址里。 */
export function mainSearchForEmbed(search: string): string {
  const base = mainSearchFromReport(search)
  const current = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  if (current.get('keepDrawingBuffer') !== '1') return base
  const next = new URLSearchParams(base.startsWith('?') ? base.slice(1) : base)
  next.set('keepDrawingBuffer', '1')
  const query = next.toString().replace(/%2F/g, '/')
  return query ? `?${query}` : ''
}

function sized(gl: ReportGl | null): ReportGl | null {
  if (!gl || gl.domElement.width <= 0 || gl.domElement.height <= 0) return null
  return gl
}

/**
 * 主场景重新挂上之后，等画布有尺寸，并且调用方给的就绪条件成立（首帧已落下）。
 * 超时返回 null。
 */
export function waitForSizedScene(options: {
  readGl: () => ReportGl | null
  sceneReady: () => boolean
  now?: () => number
  timeoutMs?: number
  schedule?: (tick: () => void) => void
}): Promise<ReportGl | null> {
  const now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()))
  const timeoutMs = options.timeoutMs ?? SCENE_WAIT_MS
  const schedule =
    options.schedule ??
    ((tick: () => void) => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => tick())
      else setTimeout(tick, 16)
    })
  const start = now()
  return new Promise((resolve) => {
    const tick = () => {
      const gl = sized(options.readGl())
      if (gl && options.sceneReady()) {
        resolve(gl)
        return
      }
      if (now() - start >= timeoutMs) {
        resolve(null)
        return
      }
      schedule(tick)
    }
    tick()
  })
}

function replaceTo(pathname: string, search: string) {
  const url = `${pathname}${search}${window.location.hash}`
  window.history.replaceState(null, '', url)
  window.dispatchEvent(new Event(TWIN_NAVIGATE_EVENT))
}

function defaultMakeUrl(blob: Blob): string {
  return URL.createObjectURL(blob)
}

function defaultDropUrl(objectUrl: string): void {
  URL.revokeObjectURL(objectUrl)
}

let makeUrl = defaultMakeUrl
let dropUrl = defaultDropUrl

function remember(blob: Blob): string {
  const next = makeUrl(blob)
  const prev = reportShotState().url
  if (prev && prev !== next) dropUrl(prev)
  publishReportShot({ url: next })
  return next
}

async function browserPorts(): Promise<EmbedPorts> {
  const shot = await import('../viewmarks/shareShot')
  const readGl = () => shot.glFromRoot(typeof document === 'undefined' ? null : document)
  return {
    readGl,
    invalidateFrame: () => shot.invalidateOneFrame(),
    readPng: (gl) => shot.readPng(gl),
    readSamples: (blob) => shot.samplesFromPng(blob),
    looksBlank: (samples) => shot.frameLooksBlank(samples),
    earlyNote: shot.SHARE_EARLY_NOTE,
    emptyNote: shot.SHARE_EMPTY_NOTE,
    blankNote: shot.SHARE_BLANK_NOTE,
    mainSearch: mainSearchForEmbed,
    go: replaceTo,
    waitForGl: () =>
      waitForSizedScene({
        readGl,
        sceneReady: () => window.__twinReady === true && window.__twinFirstFrameAt != null,
      }),
    here: () => ({
      pathname: window.location.pathname,
      search: window.location.search,
    }),
  }
}

function pngBlob(blob: Blob): Blob {
  if (blob.type === 'image/png') return blob
  return new Blob([blob], { type: 'image/png' })
}

export async function embedCurrentView(ports?: EmbedPorts): Promise<EmbedResult> {
  const current = reportShotState()
  if (current.pending) return { ok: false, message: current.note, url: current.url }
  publishReportShot({ pending: true, note: REPORT_WORKING_NOTE })

  let resolved: EmbedPorts | null = null
  let hopped = false
  let reportPath = '/report'
  let reportSearch = ''

  const restore = () => {
    if (!hopped || !resolved) return
    hopped = false
    resolved.go(reportPath, reportSearch)
  }

  const settle = (ok: boolean, message: string, nextUrl: string | null): EmbedResult => {
    publishReportShot({ pending: false, note: message, url: nextUrl })
    restore()
    return { ok, message, url: nextUrl }
  }

  try {
    resolved = ports ?? (await browserPorts())
    makeUrl = resolved.createUrl ?? defaultMakeUrl
    dropUrl = resolved.revokeUrl ?? defaultDropUrl
    const place = resolved.here()
    reportPath = place.pathname || '/report'
    reportSearch = place.search
    let gl = sized(resolved.readGl())
    if (!gl) {
      publishReportShot({ note: REPORT_HOP_NOTE })
      hopped = true
      resolved.go('/', resolved.mainSearch(reportSearch))
      gl = sized(await resolved.waitForGl())
    }
    const held = reportShotState().url
    if (!gl) return settle(false, resolved.earlyNote, held)
    // 主场景卸掉后，__twinInvalidate 还指着上一趟的 invalidate，那一帧等不到。
    // 清掉之后 shareShot 会改走当前画布的 __vpP。
    if (hopped && typeof window !== 'undefined') delete window.__twinInvalidate
    await resolved.invalidateFrame()
    const blob = await resolved.readPng(gl)
    if (!blob || blob.size === 0) return settle(false, resolved.emptyNote, held)
    let samples: ReadonlyArray<readonly [number, number, number, number]> = []
    try {
      samples = await resolved.readSamples(blob)
    } catch {
      samples = []
    }
    if (resolved.looksBlank(samples)) return settle(false, resolved.blankNote, held)
    const nextUrl = remember(pngBlob(blob))
    return settle(true, REPORT_EMBEDDED_NOTE, nextUrl)
  } catch {
    const held = reportShotState().url
    if (!resolved) {
      publishReportShot({ pending: false, note: REPORT_FAILED_NOTE })
      return { ok: false, message: REPORT_FAILED_NOTE, url: held }
    }
    return settle(false, REPORT_FAILED_NOTE, held)
  }
}
