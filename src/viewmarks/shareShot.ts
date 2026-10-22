/**
 * T049：截当前一帧，把 PNG 和带 `?vp=` 的链接一起放进剪贴板。
 * D190：不改画布创建时的绘图缓冲开关。缓冲被清成空白时，提示用户自己加
 * `?keepDrawingBuffer=1` 再刷新，不把这项常开。
 */

export const SHARE_BLANK_NOTE = '画面是空的，请加上 ?keepDrawingBuffer=1 后刷新再截'
export const SHARE_COPIED_NOTE = '截图和视角链接已复制'
export const SHARE_EARLY_NOTE = '画面还没准备好'
export const SHARE_EMPTY_NOTE = '没有截到画面'
export const SHARE_CLIPBOARD_NOTE = '剪贴板写不了，链接已在地址栏'

/** 清掉的绘图缓冲是纯黑或全透明。夜景清屏色 #07111c 的分量和至少是 7，仍算有画面。 */
const BLANK_CHANNEL_SUM = 4

export function frameLooksBlank(samples: ReadonlyArray<readonly [number, number, number, number]>): boolean {
  for (const sample of samples) {
    const r = sample[0]
    const g = sample[1]
    const b = sample[2]
    const a = sample[3]
    if (a > 0 && r + g + b >= BLANK_CHANNEL_SUM) return false
  }
  return true
}

export interface ShotCanvas {
  width: number
  height: number
  toBlob: (callback: (blob: Blob | null) => void, type?: string) => void
}

/** `.scene-root` 里的 WebGL 画布就是渲染器的 domElement。 */
export interface ShotGl {
  domElement: ShotCanvas
}

export function glFromRoot(root: { querySelectorAll: (selector: string) => ArrayLike<unknown> } | null | undefined): ShotGl | null {
  const nodes = root?.querySelectorAll('.scene-root canvas')
  if (!nodes) return null
  let best: ShotCanvas | null = null
  let area = -1
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i] as Partial<ShotCanvas> | null
    if (!node || typeof node.toBlob !== 'function') continue
    const width = node.width ?? 0
    const height = node.height ?? 0
    const next = width * height
    if (next < area) continue
    area = next
    best = node as ShotCanvas
  }
  if (!best) return null
  return { domElement: best }
}

export function readPng(gl: ShotGl): Promise<Blob | null> {
  return new Promise((resolve) => {
    gl.domElement.toBlob((blob) => resolve(blob), 'image/png')
  })
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      setTimeout(resolve, 16)
      return
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

/** 只要一帧。优先等 __twinInvalidate 在画完后返回，再读像素。 */
export async function invalidateOneFrame(): Promise<void> {
  const kick = window.__twinInvalidate
  if (kick) {
    await kick()
    return
  }
  window.__vpP?.()
  await nextPaint()
}

function pngBlob(blob: Blob): Blob {
  if (blob.type === 'image/png') return blob
  return new Blob([blob], { type: 'image/png' })
}

export function shareClipboardItem(blob: Blob, href: string, Item: typeof ClipboardItem = ClipboardItem): ClipboardItem {
  return new Item({
    'image/png': pngBlob(blob),
    'text/plain': new Blob([href], { type: 'text/plain' }),
  })
}

export async function writeShareClipboard(blob: Blob, href: string): Promise<void> {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
  if (!clipboard || typeof clipboard.write !== 'function' || typeof ClipboardItem === 'undefined') {
    throw new Error('clipboard')
  }
  await clipboard.write([shareClipboardItem(blob, href)])
}

const SAMPLE_SIDE = 24

export async function samplesFromPng(blob: Blob): Promise<Array<readonly [number, number, number, number]>> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return []
  const bitmap = await createImageBitmap(blob)
  try {
    if (bitmap.width === 0 || bitmap.height === 0) return []
    const canvas = document.createElement('canvas')
    canvas.width = SAMPLE_SIDE
    canvas.height = SAMPLE_SIDE
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return []
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(bitmap, 0, 0, SAMPLE_SIDE, SAMPLE_SIDE)
    const data = ctx.getImageData(0, 0, SAMPLE_SIDE, SAMPLE_SIDE).data
    const samples: Array<[number, number, number, number]> = []
    for (let i = 0; i < data.length; i += 4) {
      samples.push([data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0, data[i + 3] ?? 0])
    }
    return samples
  } finally {
    bitmap.close()
  }
}

export interface SharePorts {
  gl: ShotGl | null
  invalidateFrame: () => Promise<void>
  readSamples: (blob: Blob) => Promise<ReadonlyArray<readonly [number, number, number, number]>>
  writeClipboard: (blob: Blob, href: string) => Promise<void>
}

export interface ShareResult {
  ok: boolean
  message: string
}

function browserPorts(): SharePorts {
  return {
    gl: glFromRoot(typeof document === 'undefined' ? null : document),
    invalidateFrame: invalidateOneFrame,
    readSamples: samplesFromPng,
    writeClipboard: writeShareClipboard,
  }
}

export async function shareViewpointShot(href: string, ports: SharePorts = browserPorts()): Promise<ShareResult> {
  const gl = ports.gl
  if (!gl || gl.domElement.width <= 0 || gl.domElement.height <= 0) {
    return { ok: false, message: SHARE_EARLY_NOTE }
  }
  await ports.invalidateFrame()
  const blob = await readPng(gl)
  if (!blob || blob.size === 0) return { ok: false, message: SHARE_EMPTY_NOTE }
  let samples: ReadonlyArray<readonly [number, number, number, number]>
  try {
    samples = await ports.readSamples(blob)
  } catch {
    samples = []
  }
  if (frameLooksBlank(samples)) return { ok: false, message: SHARE_BLANK_NOTE }
  try {
    await ports.writeClipboard(pngBlob(blob), href)
  } catch {
    return { ok: false, message: SHARE_CLIPBOARD_NOTE }
  }
  return { ok: true, message: SHARE_COPIED_NOTE }
}
