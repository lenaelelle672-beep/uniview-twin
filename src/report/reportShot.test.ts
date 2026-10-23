import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { SHARE_BLANK_NOTE, SHARE_EARLY_NOTE, SHARE_EMPTY_NOTE, frameLooksBlank, readPng } from '../viewmarks/shareShot'
import {
  REPORT_EMBEDDED_NOTE,
  REPORT_FAILED_NOTE,
  REPORT_HOP_NOTE,
  REPORT_WORKING_NOTE,
  embedCurrentView,
  mainSearchForEmbed,
  waitForSizedScene,
  type EmbedPorts,
  type ReportGl,
} from './reportShot'
import { reportShotState, resetReportShot, subscribeReportShot } from './reportShotState'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

function canvas(width: number, height: number, blob: Blob | null, seen: string[]): ReportGl {
  return {
    domElement: {
      width,
      height,
      toBlob(callback, type) {
        seen.push(`blob:${type ?? ''}`)
        callback(blob)
      },
    },
  }
}

function ports(over: Partial<EmbedPorts> = {}): EmbedPorts {
  const png = new Blob([Uint8Array.from([1, 2, 3])], { type: 'image/png' })
  return {
    readGl: () => null,
    invalidateFrame: async () => {},
    readPng: async () => png,
    readSamples: async () => [[7, 17, 28, 255]],
    looksBlank: frameLooksBlank,
    earlyNote: SHARE_EARLY_NOTE,
    emptyNote: SHARE_EMPTY_NOTE,
    blankNote: SHARE_BLANK_NOTE,
    mainSearch: mainSearchForEmbed,
    go: () => {},
    waitForGl: async () => canvas(8, 8, png, []),
    here: () => ({ pathname: '/report', search: '?q=balanced&alarmFrom=F3&alarmTo=F8' }),
    createUrl: () => 'blob:shot',
    revokeUrl: () => {},
    ...over,
  }
}

describe('报告截图地址', () => {
  it('回到主场景时只留画质和数据，地址上已有的绘图缓冲参数继续带着', () => {
    expect(mainSearchForEmbed('?q=balanced&alarmFrom=F3&alarmTo=F8')).toBe('?q=balanced')
    expect(mainSearchForEmbed('?q=balanced&data=/sample.json&alarmStatus=offline')).toBe('?q=balanced&data=/sample.json')
    expect(mainSearchForEmbed('?q=perf&keepDrawingBuffer=1&alarmFrom=F1&alarmTo=F2')).toBe(
      '?q=perf&keepDrawingBuffer=1',
    )
    expect(mainSearchForEmbed('?data=/sample.json&keepDrawingBuffer=1')).toBe('?data=/sample.json&keepDrawingBuffer=1')
    expect(mainSearchForEmbed('')).toBe('')
  })
})

describe('嵌入当前视图', () => {
  beforeEach(() => {
    resetReportShot()
  })

  it('报告上没有画布时，先回主场景截图，再带着原筛选跳回报告', async () => {
    const seen: string[] = []
    const png = new Blob([Uint8Array.from([4, 5, 6])])
    const result = await embedCurrentView(
      ports({
        readPng: async () => {
          seen.push('read')
          return png
        },
        createUrl: (blob) => {
          seen.push(`url:${blob.type}:${blob.size}`)
          return 'blob:1'
        },
        invalidateFrame: async () => {
          seen.push('invalidate')
        },
        go: (pathname, search) => {
          seen.push(`go:${pathname}${search}`)
        },
        waitForGl: async () => {
          seen.push('wait')
          return canvas(16, 9, png, seen)
        },
      }),
    )
    expect(seen).toEqual([
      'go:/?q=balanced',
      'wait',
      'invalidate',
      'read',
      'url:image/png:3',
      'go:/report?q=balanced&alarmFrom=F3&alarmTo=F8',
    ])
    expect(result).toEqual({ ok: true, message: REPORT_EMBEDDED_NOTE, url: 'blob:1' })
    expect(reportShotState()).toMatchObject({ url: 'blob:1', note: REPORT_EMBEDDED_NOTE, pending: false })
  })

  it('画布还在时就地截，不跳转，并用 readPng 要 image/png', async () => {
    const seen: string[] = []
    const png = new Blob([Uint8Array.from([1])], { type: 'image/png' })
    const result = await embedCurrentView(
      ports({
        readGl: () => canvas(4, 4, png, seen),
        readPng,
        go: () => {
          throw new Error('should not go')
        },
        waitForGl: async () => {
          throw new Error('should not wait')
        },
        createUrl: () => 'blob:here',
      }),
    )
    expect(seen).toEqual(['blob:image/png'])
    expect(result.ok).toBe(true)
    expect(result.url).toBe('blob:here')
  })

  it('宽或高为 0 视作没有画布', async () => {
    const seen: string[] = []
    await embedCurrentView(
      ports({
        readGl: () => canvas(0, 10, null, []),
        go: (pathname) => {
          seen.push(pathname)
        },
      }),
    )
    expect(seen[0]).toBe('/')
    expect(seen.at(-1)).toBe('/report')
  })

  it('空白图不嵌入，提示与 T049 相同，并回到报告', async () => {
    let made = 0
    const seen: string[] = []
    const result = await embedCurrentView(
      ports({
        readSamples: async () => [[0, 0, 0, 255]],
        createUrl: () => {
          made += 1
          return 'blob:blank'
        },
        go: (pathname) => {
          seen.push(pathname)
        },
      }),
    )
    expect(made).toBe(0)
    expect(result.ok).toBe(false)
    expect(result.message).toBe(SHARE_BLANK_NOTE)
    expect(result.message).toContain('?keepDrawingBuffer=1')
    expect(reportShotState().url).toBeNull()
    expect(seen).toEqual(['/', '/report'])
  })

  it('采样失败也按空白处理', async () => {
    const result = await embedCurrentView(
      ports({
        readGl: () => canvas(4, 4, new Blob([Uint8Array.from([1])], { type: 'image/png' }), []),
        readSamples: async () => {
          throw new Error('bitmap')
        },
      }),
    )
    expect(result).toMatchObject({ ok: false, message: SHARE_BLANK_NOTE, url: null })
  })

  it('主场景没有准备好、空图、截图抛错，都回到报告且留下上一次的图', async () => {
    await embedCurrentView(ports({ createUrl: () => 'blob:kept' }))
    expect(reportShotState().url).toBe('blob:kept')

    const early = await embedCurrentView(
      ports({
        waitForGl: async () => null,
        createUrl: () => 'blob:nope',
      }),
    )
    expect(early).toMatchObject({ ok: false, message: SHARE_EARLY_NOTE, url: 'blob:kept' })

    const empty = await embedCurrentView(
      ports({
        readPng: async () => null,
      }),
    )
    expect(empty).toMatchObject({ ok: false, message: SHARE_EMPTY_NOTE, url: 'blob:kept' })

    const failed = await embedCurrentView(
      ports({
        invalidateFrame: async () => {
          throw new Error('lost')
        },
      }),
    )
    expect(failed).toMatchObject({ ok: false, message: REPORT_FAILED_NOTE, url: 'blob:kept' })
    expect(reportShotState().pending).toBe(false)
  })

  it('换一张新图时丢掉上一张的地址', async () => {
    const revoked: string[] = []
    let n = 0
    const shotPorts = ports({
      readGl: () => canvas(4, 4, new Blob([Uint8Array.from([1])], { type: 'image/png' }), []),
      createUrl: () => {
        n += 1
        return `blob:${n}`
      },
      revokeUrl: (objectUrl) => {
        revoked.push(objectUrl)
      },
    })
    await embedCurrentView(shotPorts)
    await embedCurrentView(shotPorts)
    expect(revoked).toEqual(['blob:1'])
    expect(reportShotState().url).toBe('blob:2')
  })

  it('正在截的时候再点一次不会再跳走', async () => {
    let release: (gl: ReportGl | null) => void = () => {}
    const gate = new Promise<ReportGl | null>((resolve) => {
      release = resolve
    })
    const seen: string[] = []
    const first = embedCurrentView(
      ports({
        waitForGl: () => gate,
        go: (pathname) => {
          seen.push(pathname)
        },
        createUrl: () => 'blob:late',
      }),
    )
    expect(reportShotState()).toMatchObject({ pending: true, note: REPORT_HOP_NOTE })
    const second = await embedCurrentView(
      ports({
        go: () => {
          throw new Error('second hop')
        },
      }),
    )
    expect(second.ok).toBe(false)
    expect(second.message).toBe(REPORT_HOP_NOTE)
    expect(seen).toEqual(['/'])
    release(canvas(8, 8, new Blob([Uint8Array.from([9])], { type: 'image/png' }), []))
    const result = await first
    expect(result.ok).toBe(true)
    expect(seen).toEqual(['/', '/report'])
  })

  it('回到主场景后不沿用上一趟已经卸掉的 invalidate', async () => {
    const host = globalThis as { window?: { __twinInvalidate?: () => Promise<void> } }
    const previous = host.window
    host.window = {
      __twinInvalidate: () => new Promise(() => {}),
    }
    let seen: unknown = 'missing'
    try {
      await embedCurrentView(
        ports({
          readGl: () => canvas(4, 4, new Blob([Uint8Array.from([1])], { type: 'image/png' }), []),
          invalidateFrame: async () => {
            seen = host.window?.__twinInvalidate
          },
        }),
      )
      expect(seen).toBeTypeOf('function')
      seen = 'missing'
      await embedCurrentView(
        ports({
          invalidateFrame: async () => {
            seen = host.window?.__twinInvalidate
          },
        }),
      )
      expect(seen).toBeUndefined()
    } finally {
      host.window = previous
    }
  })

  it('订阅能看到进行中和最终结果', async () => {
    const notes: string[] = []
    const stop = subscribeReportShot((state) => {
      notes.push(`${state.pending ? 'pending' : 'done'}:${state.note}`)
    })
    await embedCurrentView(
      ports({
        readGl: () => canvas(2, 2, new Blob([Uint8Array.from([1])], { type: 'image/png' }), []),
      }),
    )
    stop()
    expect(notes[0]).toBe(`pending:${REPORT_WORKING_NOTE}`)
    expect(notes.at(-1)).toBe(`done:${REPORT_EMBEDDED_NOTE}`)
  })
})

describe('等主场景画布', () => {
  it('尺寸和首帧都到了才返回这块画布', async () => {
    const gl = canvas(8, 8, null, [])
    let ready = false
    let current: ReportGl | null = null
    let clock = 0
    const queue: Array<() => void> = []
    const pending = waitForSizedScene({
      readGl: () => current,
      sceneReady: () => ready,
      now: () => clock,
      timeoutMs: 100,
      schedule: (tick) => {
        queue.push(tick)
      },
    })
    expect(queue).toHaveLength(1)
    current = gl
    queue.shift()?.()
    expect(queue).toHaveLength(1)
    ready = true
    queue.shift()?.()
    await expect(pending).resolves.toBe(gl)
  })

  it('超时返回空', async () => {
    let clock = 0
    const queue: Array<() => void> = []
    const pending = waitForSizedScene({
      readGl: () => null,
      sceneReady: () => false,
      now: () => clock,
      timeoutMs: 50,
      schedule: (tick) => {
        queue.push(tick)
      },
    })
    clock = 50
    queue.shift()?.()
    await expect(pending).resolves.toBeNull()
  })
})

describe('截图不进首屏，也不常开绘图缓冲', () => {
  it('报告页点击后才加载截图包，包内复用 shareShot', () => {
    const page = read('./ReportPage.tsx')
    expect(page).toMatch(/嵌入当前视图/)
    expect(page).toMatch(/import\('\.\/reportShot'\)/)
    expect(page).not.toMatch(/from '\.\/reportShot'/)
    expect(page).not.toMatch(/shareShot/)
    expect(page).toMatch(/data-report-shot/)
    expect(page).toMatch(/alt="当前三维视图"/)
    const shot = read('./reportShot.ts')
    expect(shot).toMatch(/import\('\.\.\/viewmarks\/shareShot'\)/)
    expect(shot).not.toMatch(/from '\.\.\/viewmarks\/shareShot'/)
    expect(shot).toMatch(/glFromRoot/)
    expect(shot).toMatch(/readPng/)
    expect(shot).toMatch(/frameLooksBlank/)
    expect(shot).toMatch(/SHARE_BLANK_NOTE/)
    expect(shot).toMatch(/invalidateOneFrame/)
    expect(shot).toMatch(/replaceState/)
    expect(shot).not.toMatch(/pushState/)
    expect(shot).not.toMatch(/preserveDrawingBuffer/)
    expect(shot).not.toMatch(
      /from ['"][^'"]*(fog|cameraTransition|balancedFx|postfx|DemandLoop|SoftShadows|Scene)/,
    )
    const css = read('./report.css')
    expect(css).toMatch(/\.report-shot img/)
    expect(css).toMatch(/\.report-toolbar \{\s*display: none !important;/)
    const eager = [
      '../App.tsx',
      '../main.tsx',
      '../components/Scene.tsx',
      '../components/UIShell.tsx',
      '../components/Stage.tsx',
      '../index.css',
      '../scene/fog.ts',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../scene/stage/prefetchLazyChunks.ts',
      '../scene/stage/cameraTransition.ts',
    ]
    for (const file of eager) {
      expect(read(file), file).not.toMatch(/reportShot|嵌入当前视图/)
    }
    const scene = read('../components/Scene.tsx')
    const block = scene.slice(scene.indexOf('const CANVAS_GL'), scene.indexOf('function readGpuRenderer'))
    expect(block).toMatch(/preserveDrawingBuffer: KEEP_DRAWING_BUFFER/)
    expect(block).not.toMatch(/preserveDrawingBuffer:\s*true/)
    const transition = read('../scene/stage/cameraTransition.ts')
    expect(transition).toMatch(/USER_CAMERA_SMOOTH_TIME = 0\.42/)
  })
})
