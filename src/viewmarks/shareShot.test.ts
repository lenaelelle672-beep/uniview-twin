import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  SHARE_BLANK_NOTE,
  SHARE_CLIPBOARD_NOTE,
  SHARE_COPIED_NOTE,
  SHARE_EARLY_NOTE,
  SHARE_EMPTY_NOTE,
  frameLooksBlank,
  glFromRoot,
  invalidateOneFrame,
  shareClipboardItem,
  shareViewpointShot,
  type SharePorts,
  type ShotCanvas,
} from './shareShot'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

const HREF = 'https://twin.example/app?floor=F8&vp=1~2~3~4~5~6~48~0~0~0'

function canvas(width: number, height: number, blob: Blob | null, seen: string[]): ShotCanvas {
  return {
    width,
    height,
    toBlob(callback, type) {
      seen.push(`blob:${type ?? ''}`)
      callback(blob)
    },
  }
}

function ports(over: Partial<SharePorts> & { gl: SharePorts['gl'] }): SharePorts {
  return {
    invalidateFrame: async () => {},
    readSamples: async () => [[7, 17, 28, 255]],
    writeClipboard: async () => {},
    ...over,
  }
}

describe('截图分享', () => {
  it('纯黑或全透明算空白，夜景清屏色和白模不算', () => {
    expect(frameLooksBlank([])).toBe(true)
    expect(frameLooksBlank([[0, 0, 0, 255]])).toBe(true)
    expect(frameLooksBlank([[0, 0, 0, 0]])).toBe(true)
    expect(frameLooksBlank([[3, 0, 0, 255]])).toBe(true)
    expect(frameLooksBlank([[7, 17, 28, 255]])).toBe(false)
    expect(frameLooksBlank([[0, 0, 0, 255], [255, 255, 255, 255]])).toBe(false)
  })

  it('选中 .scene-root 里最大的那块画布', () => {
    const small = canvas(2, 2, null, [])
    const large = canvas(16, 9, null, [])
    const gl = glFromRoot({
      querySelectorAll: () => [small, { toBlob: 'no' }, large],
    })
    expect(gl?.domElement).toBe(large)
    expect(glFromRoot({ querySelectorAll: () => [] })).toBeNull()
    expect(glFromRoot(null)).toBeNull()
  })

  it('剪贴板项同时带 PNG 和 ?vp= 链接', async () => {
    const png = new Blob([Uint8Array.from([9, 8, 7])], { type: 'image/png' })
    class FakeItem {
      constructor(public parts: Record<string, Blob>) {}
    }
    const item = shareClipboardItem(png, HREF, FakeItem as unknown as typeof ClipboardItem)
    const parts = (item as unknown as FakeItem).parts
    expect(parts['image/png']).toBe(png)
    expect(await parts['text/plain'].text()).toBe(HREF)
    expect(parts['text/plain'].type).toBe('text/plain')
  })

  it('先 invalidate 一帧，再 toBlob image/png，然后写入剪贴板', async () => {
    const seen: string[] = []
    const png = new Blob([Uint8Array.from([1, 2, 3])], { type: 'image/png' })
    let written = ''
    const result = await shareViewpointShot(
      HREF,
      ports({
        gl: { domElement: canvas(8, 8, png, seen) },
        invalidateFrame: async () => {
          seen.push('invalidate')
        },
        writeClipboard: async (blob, href) => {
          seen.push('write')
          expect(blob.type).toBe('image/png')
          written = href
        },
      }),
    )
    expect(seen).toEqual(['invalidate', 'blob:image/png', 'write'])
    expect(written).toBe(HREF)
    expect(result).toEqual({ ok: true, message: SHARE_COPIED_NOTE })
  })

  it('空白图不写剪贴板，并提示 keepDrawingBuffer=1', async () => {
    let written = false
    const png = new Blob([Uint8Array.from([0])], { type: 'image/png' })
    const result = await shareViewpointShot(
      HREF,
      ports({
        gl: { domElement: canvas(8, 8, png, []) },
        readSamples: async () => [[0, 0, 0, 255]],
        writeClipboard: async () => {
          written = true
        },
      }),
    )
    expect(written).toBe(false)
    expect(result.ok).toBe(false)
    expect(result.message).toBe(SHARE_BLANK_NOTE)
    expect(result.message).toContain('?keepDrawingBuffer=1')
  })

  it('没有画布、空图、剪贴板失败各有提示', async () => {
    expect(
      await shareViewpointShot(
        HREF,
        ports({
          gl: null,
          invalidateFrame: async () => {
            throw new Error('should not run')
          },
        }),
      ),
    ).toEqual({ ok: false, message: SHARE_EARLY_NOTE })

    expect(
      await shareViewpointShot(HREF, ports({ gl: { domElement: canvas(4, 4, null, []) } })),
    ).toEqual({ ok: false, message: SHARE_EMPTY_NOTE })

    expect(
      await shareViewpointShot(
        HREF,
        ports({
          gl: { domElement: canvas(4, 4, new Blob([Uint8Array.from([1])], { type: 'image/png' }), []) },
          writeClipboard: async () => {
            throw new Error('denied')
          },
        }),
      ),
    ).toEqual({ ok: false, message: SHARE_CLIPBOARD_NOTE })
  })

  it('invalidate 走现成的一帧钩子', async () => {
    const host = globalThis as { window?: Window }
    const previous = host.window
    let calls = 0
    host.window = {
      __twinInvalidate: () => {
        calls += 1
        return Promise.resolve()
      },
    } as Window
    await invalidateOneFrame()
    expect(calls).toBe(1)
    host.window = previous
  })
})

describe('截图包不进首屏，也不常开绘图缓冲', () => {
  it('按钮贴在书签条上，捕获逻辑点击后才加载', () => {
    const dock = read('./ViewmarkDock.tsx')
    expect(dock).toMatch(/截图\/分享/)
    expect(dock).toMatch(/import\('\.\/shareShot'\)/)
    expect(dock).not.toMatch(/from '\.\/shareShot'/)
    expect(dock).toMatch(/captureToken\(\)/)
    expect(dock).toMatch(/storeToSearch\(\)/)
    expect(dock).toMatch(/formatViewpoint/)
    const shot = read('./shareShot.ts')
    expect(shot).toMatch(/gl\.domElement\.toBlob\(/)
    expect(shot).toMatch(/'image\/png'/)
    expect(shot).toMatch(/ClipboardItem/)
    expect(shot).toMatch(/__twinInvalidate/)
    expect(shot).toMatch(/\?keepDrawingBuffer=1/)
    expect(shot).not.toMatch(/preserveDrawingBuffer/)
  })

  it('首屏、雾、过渡、后处理和禁项都不引用这个包', () => {
    const shot = read('./shareShot.ts')
    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../index.css',
      '../scene/stage/prefetchLazyChunks.ts',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../scene/fog.ts',
      '../scene/stage/cameraTransition.ts',
    ]
    for (const file of eager) {
      expect(read(file)).not.toMatch(/shareShot|截图\/分享/)
    }
    expect(shot).not.toMatch(
      /from ['"][^'"]*(fog|cameraTransition|balancedFx|postfx|DemandLoop|SoftShadows|Scene)/,
    )
    expect(shot).not.toMatch(/Reflector|transmission|Vignette|ssgi|pathtracer|jsdelivr|FloorBadges|postprocessing|FogExp2|smoothTime/i)
    const scene = read('../components/Scene.tsx')
    const block = scene.slice(scene.indexOf('const CANVAS_GL'), scene.indexOf('function readGpuRenderer'))
    expect(block).toMatch(/preserveDrawingBuffer: KEEP_DRAWING_BUFFER/)
    expect(block).not.toMatch(/preserveDrawingBuffer:\s*true/)
    const transition = read('../scene/stage/cameraTransition.ts')
    expect(transition).toMatch(/USER_CAMERA_SMOOTH_TIME = 0\.42/)
  })
})
