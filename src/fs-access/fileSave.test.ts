import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { CLIP_FILENAME } from '../capture/clipPolicy'
import { downloadClip } from '../capture/mountClip'
import { FOG_DENSITY } from '../scene/fog'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { downloadGlb } from '../viewmarks/floorGlb'
import { FILE_SAVE_SOURCE_BLOCK } from '../../scripts/fsAccessPlugin'
import { detachFileSaveForTests, mountFileSave } from './mount'
import {
  CLIP_SAVE_NAME,
  canUseSavePicker,
  isAbortError,
  pickerOptions,
  readSaveHost,
  routeSaveClick,
  saveTargetName,
  type SaveHost,
  type SavePickerOptions,
  type SaveWritable,
} from './policy'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

function glbBytes(): ArrayBuffer {
  const bytes = new Uint8Array([7, 1, 2, 9])
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

interface Store {
  options: SavePickerOptions[]
  writes: Blob[]
  closes: number
  aborts: number
}

function emptyStore(): Store {
  return { options: [], writes: [], closes: 0, aborts: 0 }
}

function writableFor(store: Store, fail: 'write' | 'writable' | null): SaveWritable {
  return {
    async write(data: Blob) {
      if (fail === 'write') throw new Error('disk')
      store.writes.push(data)
    },
    async close() {
      store.closes += 1
    },
    async abort() {
      store.aborts += 1
    },
  }
}

type PickerMode = 'ok' | 'abort' | 'sync-abort' | 'fail' | 'write-fail' | 'writable-fail'

function pickerFor(store: Store, mode: PickerMode): NonNullable<SaveHost['showSaveFilePicker']> {
  return (options) => {
    store.options.push(options)
    if (mode === 'sync-abort') throw new DOMException('cancel', 'AbortError')
    if (mode === 'abort') return Promise.reject(new DOMException('cancel', 'AbortError'))
    if (mode === 'fail') return Promise.reject(new DOMException('blocked', 'NotAllowedError'))
    if (mode === 'writable-fail') {
      return Promise.resolve({
        createWritable: () => Promise.reject(new Error('no-writable')),
      })
    }
    return Promise.resolve({
      createWritable: () => Promise.resolve(writableFor(store, mode === 'write-fail' ? 'write' : null)),
    })
  }
}

function host(store: Store, mode: PickerMode | 'missing', over: Partial<SaveHost> = {}): SaveHost {
  return {
    isSecureContext: true,
    userGesture: true,
    showSaveFilePicker: mode === 'missing' ? undefined : pickerFor(store, mode),
    ...over,
  }
}

describe('另存为策略', () => {
  it('只认楼层 glb 和短录像文件名', () => {
    expect(CLIP_SAVE_NAME).toBe(CLIP_FILENAME)
    expect(saveTargetName('F12.glb')).toBe(true)
    expect(saveTargetName('B1.glb')).toBe(true)
    expect(saveTargetName(CLIP_FILENAME)).toBe(true)
    expect(saveTargetName('other.webm')).toBe(false)
    expect(saveTargetName('shot.png')).toBe(false)
    expect(saveTargetName('alarms.csv')).toBe(false)
    expect(saveTargetName('')).toBe(false)
    expect(pickerOptions('F3.glb').types[0]?.accept['model/gltf-binary']).toEqual(['.glb'])
    expect(pickerOptions(CLIP_FILENAME).types[0]?.accept['video/webm']).toEqual(['.webm'])
  })

  it('选择器成功时写入并关闭，不退回 a.download', async () => {
    const store = emptyStore()
    const blob = new Blob(['glb'], { type: 'model/gltf-binary' })
    let native = 0
    let fallback = 0
    routeSaveClick({
      filename: 'F12.glb',
      blob,
      host: host(store, 'ok'),
      nativeClick: () => {
        native += 1
      },
      fallbackDownload: () => {
        fallback += 1
      },
    })
    expect(store.options).toEqual([pickerOptions('F12.glb')])
    await flush()
    expect(store.writes).toEqual([blob])
    expect(store.closes).toBe(1)
    expect(store.aborts).toBe(0)
    expect(native).toBe(0)
    expect(fallback).toBe(0)
  })

  it('取消抛 AbortError 时安静结束，不下载', async () => {
    const store = emptyStore()
    let native = 0
    let fallback = 0
    expect(isAbortError(new DOMException('cancel', 'AbortError'))).toBe(true)
    expect(() => {
      routeSaveClick({
        filename: CLIP_FILENAME,
        blob: new Blob(['webm'], { type: 'video/webm' }),
        host: host(store, 'sync-abort'),
        nativeClick: () => {
          native += 1
        },
        fallbackDownload: () => {
          fallback += 1
        },
      })
    }).not.toThrow()
    routeSaveClick({
      filename: 'B1.glb',
      blob: new Blob(['glb']),
      host: host(store, 'abort'),
      nativeClick: () => {
        native += 1
      },
      fallbackDownload: () => {
        fallback += 1
      },
    })
    await flush()
    expect(store.writes).toEqual([])
    expect(native).toBe(0)
    expect(fallback).toBe(0)
  })

  it('不支持、没有手势或不安全时退回 a.download，写入失败也退回', async () => {
    const blob = new Blob(['glb'], { type: 'model/gltf-binary' })
    const cases: Array<Partial<SaveHost> & { mode: PickerMode | 'missing' }> = [
      { mode: 'missing' },
      { mode: 'ok', isSecureContext: false },
      { mode: 'ok', userGesture: false },
      { mode: 'fail' },
      { mode: 'write-fail' },
      { mode: 'writable-fail' },
    ]
    for (const item of cases) {
      const store = emptyStore()
      let native = 0
      let fallback = 0
      const picked = host(store, item.mode, item)
      routeSaveClick({
        filename: 'F12.glb',
        blob,
        host: picked,
        nativeClick: () => {
          native += 1
        },
        fallbackDownload: () => {
          fallback += 1
        },
      })
      await flush()
      const opened = item.mode !== 'missing' && item.isSecureContext !== false && item.userGesture !== false
      if (!opened) {
        expect(native, item.mode).toBe(1)
        expect(fallback, item.mode).toBe(0)
        expect(store.options, item.mode).toEqual([])
      } else {
        expect(native, item.mode).toBe(0)
        expect(fallback, item.mode).toBe(1)
      }
    }

    let called = false
    const quiet = readSaveHost({
      isSecureContext: true,
      navigator: { userActivation: { isActive: false, hasBeenActive: true } },
      showSaveFilePicker: () => {
        called = true
        return Promise.reject(new Error('no'))
      },
    } as unknown as Window)
    expect(canUseSavePicker(quiet)).toBe(false)
    expect(quiet.userGesture).toBe(false)
    let native = 0
    routeSaveClick({
      filename: 'F1.glb',
      blob,
      host: quiet,
      nativeClick: () => {
        native += 1
      },
      fallbackDownload: () => {
        native += 10
      },
    })
    expect(called).toBe(false)
    expect(native).toBe(1)
  })
})

class SaveAnchorElement {
  href = ''
  download = ''
  rel = ''
  appended = false
  clicked = false
  click() {
    this.clicked = true
  }
  remove() {
    this.appended = false
  }
  getAttribute(name: string): string | null {
    if (name === 'href') return this.href
    return null
  }
}

interface SaveWindow {
  document: {
    body: { append: (node: SaveAnchorElement) => void }
    createElement: (tag: string) => SaveAnchorElement
  }
  isSecureContext: boolean
  navigator: { userActivation: { isActive: boolean; hasBeenActive: boolean } }
  setTimeout: typeof setTimeout
  showSaveFilePicker?: SaveHost['showSaveFilePicker']
}

function installDom(): {
  win: SaveWindow
  made: SaveAnchorElement[]
  restore: () => void
} {
  const made: SaveAnchorElement[] = []
  const body = {
    append(node: SaveAnchorElement) {
      node.appended = true
    },
  }
  const documentStub = {
    body,
    createElement(tag: string) {
      if (tag !== 'a') throw new Error(tag)
      const node = new SaveAnchorElement()
      made.push(node)
      return node
    },
  }
  const win: SaveWindow = {
    document: documentStub,
    isSecureContext: true,
    navigator: { userActivation: { isActive: true, hasBeenActive: true } },
    setTimeout,
  }
  const prev = {
    document: globalThis.document,
    window: globalThis.window,
    HTMLAnchorElement: (globalThis as { HTMLAnchorElement?: unknown }).HTMLAnchorElement,
  }
  globalThis.document = documentStub as unknown as Document
  globalThis.window = win as unknown as Window & typeof globalThis
  ;(globalThis as { HTMLAnchorElement?: unknown }).HTMLAnchorElement = SaveAnchorElement
  return {
    win,
    made,
    restore: () => {
      detachFileSaveForTests()
      globalThis.document = prev.document
      globalThis.window = prev.window
      ;(globalThis as { HTMLAnchorElement?: unknown }).HTMLAnchorElement = prev.HTMLAnchorElement
    },
  }
}

function clicked(nodes: SaveAnchorElement[]): SaveAnchorElement[] {
  return nodes.filter((node) => node.clicked)
}

describe('downloadGlb 和录制下载旁路', () => {
  afterEach(() => {
    detachFileSaveForTests()
  })

  it('挂上之后 downloadGlb 优先 showSaveFilePicker，成功就不走 a.download', async () => {
    const dom = installDom()
    const store = emptyStore()
    dom.win.showSaveFilePicker = pickerFor(store, 'ok')
    mountFileSave()
    mountFileSave()
    let seen = false
    const picker = dom.win.showSaveFilePicker
    dom.win.showSaveFilePicker = (options) => {
      seen = true
      return picker?.(options) ?? Promise.reject(new Error('missing'))
    }
    try {
      downloadGlb(glbBytes(), 'F12.glb')
      expect(seen).toBe(true)
      await flush()
      expect(store.options[0]?.suggestedName).toBe('F12.glb')
      expect(store.writes).toHaveLength(1)
      expect(store.writes[0]?.type).toBe('model/gltf-binary')
      expect(Array.from(new Uint8Array(await store.writes[0]!.arrayBuffer()))).toEqual([7, 1, 2, 9])
      expect(store.closes).toBe(1)
      expect(clicked(dom.made)).toEqual([])
    } finally {
      dom.restore()
    }
  })

  it('录制文件取消选择器时不退回 a.download', async () => {
    const dom = installDom()
    const store = emptyStore()
    dom.win.showSaveFilePicker = pickerFor(store, 'abort')
    mountFileSave()
    const blob = new Blob([Uint8Array.from([9, 8, 7])], { type: 'video/webm' })
    try {
      expect(() => downloadClip(blob, CLIP_FILENAME)).not.toThrow()
      await flush()
      expect(store.options[0]?.suggestedName).toBe(CLIP_FILENAME)
      expect(store.writes).toEqual([])
      expect(clicked(dom.made)).toEqual([])
    } finally {
      dom.restore()
    }
  })

  it('没有选择器、没有手势或写入失败时退回 a.download', async () => {
    const unsupported = installDom()
    mountFileSave()
    try {
      downloadGlb(glbBytes(), 'B1.glb')
      expect(clicked(unsupported.made)).toEqual([unsupported.made[0]])
      expect(unsupported.made[0]?.download).toBe('B1.glb')
      expect(unsupported.made[0]?.rel).toBe('noopener')
    } finally {
      unsupported.restore()
    }

    const quiet = installDom()
    const store = emptyStore()
    quiet.win.navigator.userActivation.isActive = false
    quiet.win.showSaveFilePicker = pickerFor(store, 'ok')
    mountFileSave()
    try {
      downloadClip(new Blob(['v'], { type: 'video/webm' }), CLIP_FILENAME)
      expect(store.options).toEqual([])
      expect(clicked(quiet.made)).toEqual([quiet.made[0]])
    } finally {
      quiet.restore()
    }

    const insecure = installDom()
    const blocked = emptyStore()
    insecure.win.isSecureContext = false
    insecure.win.showSaveFilePicker = pickerFor(blocked, 'ok')
    mountFileSave()
    try {
      downloadGlb(glbBytes(), 'F1.glb')
      expect(blocked.options).toEqual([])
      expect(clicked(insecure.made)).toHaveLength(1)
    } finally {
      insecure.restore()
    }

    const broken = installDom()
    const failed = emptyStore()
    broken.win.showSaveFilePicker = pickerFor(failed, 'fail')
    mountFileSave()
    try {
      downloadGlb(glbBytes(), 'F22.glb')
      await flush()
      expect(failed.options).toHaveLength(1)
      expect(clicked(broken.made)).toHaveLength(1)
      expect(broken.made[0]?.clicked).toBe(false)
      expect(broken.made[1]?.download).toBe('F22.glb')
      expect(broken.made[1]?.rel).toBe('noopener')
      expect(broken.made[1]?.clicked).toBe(true)
    } finally {
      broken.restore()
    }
  })

  it('别的下载名和未挂上时仍走原来的 a.download', () => {
    const dom = installDom()
    const store = emptyStore()
    dom.win.showSaveFilePicker = pickerFor(store, 'ok')
    mountFileSave()
    try {
      const blob = new Blob(['csv'], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'alarms.csv'
      link.rel = 'noopener'
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      expect(store.options).toEqual([])
      expect(clicked(dom.made)).toHaveLength(1)

      const png = document.createElement('a')
      const pngUrl = URL.createObjectURL(new Blob(['png'], { type: 'image/png' }))
      png.href = pngUrl
      png.download = 'shot.png'
      document.body.append(png)
      png.click()
      png.remove()
      URL.revokeObjectURL(pngUrl)
      expect(store.options).toEqual([])
      expect(clicked(dom.made)).toHaveLength(2)
    } finally {
      dom.restore()
    }

    const bare = installDom()
    try {
      downloadGlb(glbBytes(), 'F12.glb')
      expect(clicked(bare.made)).toHaveLength(1)
    } finally {
      bare.restore()
    }
  })
})

describe('另存为分包不进首屏', () => {
  it('懒挂在 dock 哈希之后，不进分享、雾和 T032', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)

    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const policy = read('./policy.ts')
    const plugin = read('../../scripts/fsAccessPlugin.ts')
    const vite = read('../../vite.config.ts')
    const floor = read('../viewmarks/floorGlb.ts')
    const clip = read('../capture/mountClip.ts')
    const share = read('../viewmarks/shareShot.ts')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }

    expect(dock).toContain(FILE_SAVE_SOURCE_BLOCK)
    expect(dock).toMatch(/import\('\.\.\/fs-access\/mount'\)/)
    expect(dock).toMatch(/mountFileSave\(\)/)
    expect(dock).not.toMatch(/from '\.\.\/fs-access\/mount'/)
    expect(dock).not.toMatch(/showSaveFilePicker|createWritable/)
    const stripped = dock.replace(FILE_SAVE_SOURCE_BLOCK, '')
    expect(stripped).not.toMatch(/mountFileSave|fs-access/)
    expect(stripped).toMatch(/mountBroadcastBus\(\(\) => import\('\.\.\/components\/scene\/vp'\)\)/)
    expect(stripped).toMatch(/mountCycleRaycast\(\)\n\}\)\n\nconst LayerPanel/)
    expect(plugin).toContain(FILE_SAVE_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'fs-access-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/FileSave\.js/)
    expect(vite).toMatch(/fsAccessAfterHash/)

    expect(floor).toMatch(/URL\.createObjectURL\(blob\)/)
    expect(floor).toMatch(/link\.download = filename/)
    expect(floor).toMatch(/link\.click\(\)/)
    expect(floor).not.toMatch(/showSaveFilePicker|mountFileSave|createWritable/)
    expect(clip).toMatch(/URL\.createObjectURL\(blob\)/)
    expect(clip).toMatch(/link\.download = filename/)
    expect(clip).toMatch(/link\.click\(\)/)
    expect(clip).toMatch(/export function downloadClip/)
    expect(clip).not.toMatch(/showSaveFilePicker|mountFileSave|createWritable/)
    expect(share).not.toMatch(/showSaveFilePicker|mountFileSave|createWritable|fs-access/)

    const blob = [mount, policy].join('\n')
    expect(blob).not.toMatch(/import\(/)
    expect(blob).not.toMatch(/console\./)
    expect(blob).not.toMatch(/shareShot|clipboard|ClipboardItem|writeText/)
    expect(blob).not.toMatch(/from ['"][^'"]*(shareShot|fog|cameraTransition|balancedFx|pip\/|floorGlb|mountClip|three|zustand)/)
    expect(mount).toMatch(/HTMLAnchorElement\.prototype/)
    expect(policy).toMatch(/showSaveFilePicker/)
    expect(policy).toMatch(/createWritable/)
    expect(policy).toMatch(/AbortError/)
    expect(policy).toMatch(/userActivation\?\.isActive/)
    expect(policy).toMatch(/isSecureContext/)

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../index.css',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../scene/stage/prefetchLazyChunks.ts',
      '../scene/fog.ts',
      '../scene/stage/cameraTransition.ts',
      '../viewmarks/shareShot.ts',
      '../viewmarks/ViewmarkDock.tsx',
      '../viewmarks/floorGlb.ts',
      '../capture/mountClip.ts',
      '../capture/clipSession.ts',
      '../pip/mount.ts',
      '../pip/session.ts',
    ]
    for (const file of eager) {
      expect(read(file), file).not.toMatch(/showSaveFilePicker|mountFileSave|fs-access/)
    }

    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(Object.keys(pkg.dependencies).sort()).toEqual(
      [
        '@react-three/drei',
        '@react-three/fiber',
        '@react-three/postprocessing',
        'postprocessing',
        'react',
        'react-dom',
        'three',
        'troika-three-text',
        'troika-three-utils',
        'troika-worker-utils',
        'zustand',
      ].sort(),
    )
    expect(mountFileSave).toBeTypeOf('function')
    expect(() => mountFileSave()).not.toThrow()
  })
})
