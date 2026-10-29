/**
 * T088：GLB / 短录像另存为。
 * dock 在首帧 2600ms 之后才 import。生产构建在哈希定稿前摘掉这段，
 * 定稿后再把独立分包接回去，不进 hardGate / balancedFx，picker 正文也不进 dock。
 *
 * T057 `downloadGlb` 和 T062 录制下载仍然是 ObjectURL + `<a download>` + click。
 * 这里只包住这一下 click：安全上下文且用户手势还在，就改走 showSaveFilePicker → createWritable。
 * 不支持、没有手势、或写入失败，退回原来的 a.download。取消（AbortError）安静结束。
 * 不改 T049 分享，也不接管别的文件名。
 */
import { readSaveHost, routeSaveClick, saveTargetName, type SaveAnchor } from './policy'

const REMEMBER_CAP = 8

let restore: (() => void) | null = null

type ClickFn = (this: SaveAnchor) => void

interface UrlApi {
  createObjectURL: (obj: Blob | MediaSource) => string
  revokeObjectURL: (url: string) => void
}

function remember(blobs: Map<string, Blob>, url: string, blob: Blob): void {
  blobs.set(url, blob)
  while (blobs.size > REMEMBER_CAP) {
    const oldest = blobs.keys().next().value
    if (oldest === undefined) break
    blobs.delete(oldest)
  }
}

function blobFor(anchor: SaveAnchor, blobs: Map<string, Blob>): Blob | undefined {
  const direct = blobs.get(anchor.href)
  if (direct) return direct
  try {
    const attr = anchor.getAttribute?.('href')
    if (attr) return blobs.get(attr)
  } catch {
    // 读不到属性就当没有缓存。
  }
  return undefined
}

function freshDownload(blob: Blob, filename: string, urlApi: UrlApi, originalCreate: UrlApi['createObjectURL'], originalRevoke: UrlApi['revokeObjectURL'], originalClick: ClickFn): void {
  const url = originalCreate.call(urlApi, blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body?.append(link)
  try {
    originalClick.call(link)
  } finally {
    link.remove()
    originalRevoke.call(urlApi, url)
  }
}

function install(proto: { click: ClickFn }, win: Window): () => void {
  const urlApi = URL as unknown as UrlApi
  const originalCreate = urlApi.createObjectURL
  const originalRevoke = urlApi.revokeObjectURL
  const originalClick = proto.click
  const blobs = new Map<string, Blob>()
  const undo = () => {
    urlApi.createObjectURL = originalCreate
    urlApi.revokeObjectURL = originalRevoke
    proto.click = originalClick
    blobs.clear()
  }

  try {
    urlApi.createObjectURL = (obj: Blob | MediaSource) => {
      const url = originalCreate.call(urlApi, obj)
      if (typeof Blob !== 'undefined' && obj instanceof Blob) remember(blobs, url, obj)
      return url
    }
    urlApi.revokeObjectURL = (url: string) => {
      blobs.delete(url)
      originalRevoke.call(urlApi, url)
    }
    proto.click = function (this: SaveAnchor) {
      const filename = this.download || ''
      if (!saveTargetName(filename)) {
        originalClick.call(this)
        return
      }
      const native = () => {
        try {
          originalClick.call(this)
        } catch {
          // 目标文件退回下载失败也不抛。
        }
      }
      try {
        routeSaveClick({
          filename,
          blob: blobFor(this, blobs),
          host: readSaveHost(win),
          nativeClick: native,
          fallbackDownload: (blob, name) => {
            try {
              freshDownload(blob, name, urlApi, originalCreate, originalRevoke, originalClick)
            } catch {
              // 退回 a.download 失败也不抛。
            }
          },
        })
      } catch {
        native()
      }
    }
  } catch (error) {
    undo()
    throw error
  }

  return undo
}

function anchorProto(): { click: ClickFn } | null {
  if (typeof HTMLAnchorElement === 'undefined') return null
  const proto = HTMLAnchorElement.prototype as unknown as { click?: ClickFn }
  if (!proto || typeof proto.click !== 'function') return null
  return proto as { click: ClickFn }
}

/** dock 晚加载之后调用。重复调用不会包两层。没有锚点原型时直接返回。 */
export function mountFileSave(): void {
  if (restore) return
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof URL === 'undefined') return
  const proto = anchorProto()
  if (!proto) return
  try {
    restore = install(proto, window)
  } catch {
    restore = null
  }
}

/** 测试把原型和 URL 方法放回去。生产路径不调用。 */
export function detachFileSaveForTests(): void {
  restore?.()
  restore = null
}
