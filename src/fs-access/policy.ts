/**
 * T088：另存为策略。只认 T057 的 `.glb` 和 T062 的短录像文件名。
 * 安全上下文且这一下仍有用户手势才走 showSaveFilePicker。
 * 取消是 AbortError，安静结束。其余失败退回调用方自己的 a.download。
 * 不处理截图、剪贴板和别的下载名，避免和 T049 分享混路。
 */

/** 与 T062 `CLIP_FILENAME` 同一条。别的 webm 不接管。 */
export const CLIP_SAVE_NAME = 'uniview-clip.webm'

export interface SavePickerOptions {
  suggestedName: string
  types: Array<{ description: string; accept: Record<string, string[]> }>
}

export interface SaveWritable {
  write(data: Blob): Promise<void>
  close(): Promise<void>
  abort?: () => Promise<void>
}

export interface SaveHandle {
  createWritable(): Promise<SaveWritable>
}

export interface SaveHost {
  isSecureContext: boolean
  userGesture: boolean
  showSaveFilePicker?: (options: SavePickerOptions) => Promise<SaveHandle>
}

export interface SaveAnchor {
  href: string
  download: string
  getAttribute?: (name: string) => string | null
}

export function saveTargetName(filename: string): boolean {
  return filename.endsWith('.glb') || filename === CLIP_SAVE_NAME
}

export function pickerOptions(filename: string): SavePickerOptions {
  if (filename.endsWith('.glb')) {
    return {
      suggestedName: filename,
      types: [{ description: 'GLB', accept: { 'model/gltf-binary': ['.glb'] } }],
    }
  }
  return {
    suggestedName: filename,
    types: [{ description: 'WebM', accept: { 'video/webm': ['.webm'] } }],
  }
}

export function canUseSavePicker(host: SaveHost): boolean {
  return host.isSecureContext === true && host.userGesture === true && typeof host.showSaveFilePicker === 'function'
}

export function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError'
}

type Picker = (this: Window, options: SavePickerOptions) => Promise<SaveHandle>

export function readSaveHost(win: Window): SaveHost {
  try {
    const raw = (win as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker
    const showSaveFilePicker =
      typeof raw === 'function'
        ? (options: SavePickerOptions) => (raw as Picker).call(win, options)
        : undefined
    return {
      isSecureContext: win.isSecureContext === true,
      userGesture: win.navigator?.userActivation?.isActive === true,
      showSaveFilePicker,
    }
  } catch {
    return { isSecureContext: false, userGesture: false }
  }
}

function runFallback(fallback: () => void): void {
  try {
    fallback()
  } catch {
    // 退回下载失败也不向外抛。
  }
}

/** 在当前调用栈里同步打开选择器，避免再 await 一次把用户手势耗掉。 */
export function startSave(blob: Blob, filename: string, host: SaveHost, fallback: () => void): void {
  const pick = host.showSaveFilePicker
  if (!canUseSavePicker(host) || !pick) {
    runFallback(fallback)
    return
  }
  let pending: Promise<SaveHandle>
  try {
    pending = pick(pickerOptions(filename))
  } catch (error) {
    if (!isAbortError(error)) runFallback(fallback)
    return
  }
  void pending
    .then(async (handle) => {
      const writable = await handle.createWritable()
      try {
        await writable.write(blob)
        await writable.close()
      } catch (error) {
        try {
          await writable.abort?.()
        } catch {
          // 半截文件关不上也不再抛。
        }
        throw error
      }
    })
    .catch((error) => {
      if (isAbortError(error)) return
      runFallback(fallback)
    })
}

export function routeSaveClick(input: {
  filename: string
  blob: Blob | undefined
  host: SaveHost
  nativeClick: () => void
  fallbackDownload: (blob: Blob, filename: string) => void
}): void {
  if (!saveTargetName(input.filename) || !input.blob) {
    input.nativeClick()
    return
  }
  const blob = input.blob
  const filename = input.filename
  let sync = true
  startSave(blob, filename, input.host, () => {
    if (sync) input.nativeClick()
    else input.fallbackDownload(blob, filename)
  })
  sync = false
}
