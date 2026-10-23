import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import {
  fullscreenDisabled,
  fullscreenOffFromSearch,
  pickFullscreenElement,
  toggleFullscreen,
  type FullscreenHost,
} from './fullscreen'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

function element(request?: () => Promise<void>): Element {
  return { requestFullscreen: request } as unknown as Element
}

function host(partial: Partial<FullscreenHost> & Pick<FullscreenHost, 'documentElement'>): FullscreenHost {
  return {
    fullscreenElement: null,
    querySelector: () => null,
    ...partial,
  }
}

describe('全屏开关', () => {
  it('只认 nofullscreen=1，原始导航地址也能读到', () => {
    expect(fullscreenOffFromSearch('?nofullscreen=1')).toBe(true)
    expect(fullscreenOffFromSearch('nofullscreen=1&q=balanced')).toBe(true)
    expect(fullscreenOffFromSearch('?q=balanced&nofullscreen=1')).toBe(true)
    expect(fullscreenOffFromSearch('?nofullscreen=0')).toBe(false)
    expect(fullscreenOffFromSearch('?q=perf')).toBe(false)
    expect(fullscreenDisabled('?nofullscreen=1', null)).toBe(true)
    expect(fullscreenDisabled('?q=balanced', 'http://127.0.0.1:5190/?nofullscreen=1')).toBe(true)
    expect(fullscreenDisabled('', 'http://127.0.0.1:5190/?q=balanced')).toBe(false)
    expect(fullscreenDisabled('?nofullscreen=1', 'not a url')).toBe(true)
    expect(fullscreenDisabled('', 'not a url')).toBe(false)
    expect(fullscreenDisabled('', null)).toBe(false)
  })

  it('优先画布容器，没有再退到 documentElement', () => {
    const scene = element()
    const root = element()
    expect(
      pickFullscreenElement({
        documentElement: root,
        querySelector: (selector) => (selector === '.scene-root' ? scene : null),
      }),
    ).toBe(scene)
    expect(
      pickFullscreenElement({
        documentElement: root,
        querySelector: () => null,
      }),
    ).toBe(root)
  })

  it('进入画布容器，退出走 exitFullscreen', async () => {
    let which = ''
    const scene = element(() => {
      which = 'scene'
      return Promise.resolve()
    })
    const root = element(() => {
      which = 'root'
      return Promise.resolve()
    })
    const entered = await toggleFullscreen(
      host({
        documentElement: root,
        querySelector: (selector) => (selector === '.scene-root' ? scene : null),
      }),
      '',
      null,
    )
    expect(which).toBe('scene')
    expect(entered).toEqual({ ok: true, active: true, message: '已进入全屏，Esc 退出' })

    const fallback = await toggleFullscreen(
      host({
        documentElement: root,
      }),
      '',
      null,
    )
    expect(fallback.ok).toBe(true)
    expect(which).toBe('root')

    let exited = false
    let enteredAgain = false
    const left = await toggleFullscreen(
      host({
        documentElement: element(() => {
          enteredAgain = true
          return Promise.resolve()
        }),
        fullscreenElement: element(),
        exitFullscreen: () => {
          exited = true
          return Promise.resolve()
        },
      }),
      '',
      null,
    )
    expect(exited).toBe(true)
    expect(enteredAgain).toBe(false)
    expect(left).toEqual({ ok: true, active: false, message: '已退出全屏' })
  })

  it('参数关闭、缺少 API、没有手势时都不抛', async () => {
    let calls = 0
    const blocked = await toggleFullscreen(
      host({
        documentElement: element(() => {
          calls += 1
          return Promise.resolve()
        }),
      }),
      '?nofullscreen=1',
      null,
    )
    expect(calls).toBe(0)
    expect(blocked).toEqual({ ok: false, active: false, message: '全屏已关闭' })

    const missing = await toggleFullscreen(
      host({
        documentElement: {} as Element,
      }),
      '',
      null,
    )
    expect(missing).toEqual({ ok: false, active: false, message: '当前浏览器不能全屏' })

    const thrown = await toggleFullscreen(
      host({
        documentElement: element(() => {
          throw new Error('no-gesture')
        }),
      }),
      '',
      null,
    )
    expect(thrown).toEqual({ ok: false, active: false, message: '全屏没有完成' })

    const rejected = await toggleFullscreen(
      host({
        documentElement: element(() => Promise.reject(new Error('no-gesture'))),
      }),
      '',
      null,
    )
    expect(rejected).toEqual({ ok: false, active: false, message: '全屏没有完成' })

    const exitRejected = await toggleFullscreen(
      host({
        documentElement: element(),
        fullscreenElement: element(),
        exitFullscreen: () => Promise.reject(new Error('no-gesture')),
      }),
      '',
      null,
    )
    expect(exitRejected).toEqual({ ok: false, active: true, message: '全屏没有完成' })

    const exitMissing = await toggleFullscreen(
      host({
        documentElement: element(),
        fullscreenElement: element(),
      }),
      '',
      null,
    )
    expect(exitMissing).toEqual({ ok: false, active: true, message: '当前浏览器不能退出全屏' })

    await expect(toggleFullscreen()).resolves.toEqual({
      ok: false,
      active: false,
      message: '当前浏览器不能全屏',
    })
  })
})

describe('全屏包不进首屏', () => {
  it('按钮和 F 在书签条上，API 仍是动态 import', () => {
    const dock = read('./ViewmarkDock.tsx')
    const src = read('./fullscreen.ts')
    const css = read('./viewmark.css')
    expect(dock).toMatch(/data-fullscreen/)
    expect(dock).toMatch(/进入全屏/)
    expect(dock).toMatch(/aria-keyshortcuts="f"/)
    expect(dock).toMatch(/event\.key !== 'f' && event\.key !== 'F'/)
    expect(dock).toMatch(/shortcutTargetBlocks/)
    expect(dock).toMatch(/import\('\.\/fullscreen'\)/)
    expect(dock).not.toMatch(/from '\.\/fullscreen'/)
    expect(dock).not.toMatch(/requestFullscreen|exitFullscreen/)
    expect(dock).toMatch(/event\.key !== 'Escape' \|\| !document\.fullscreenElement/)
    expect(dock).toMatch(/stopPropagation\(\)/)
    expect(dock).not.toMatch(/exitFullscreen\(\)/)
    expect(src).toMatch(/\.scene-root/)
    expect(src).toMatch(/documentElement/)
    expect(src).toMatch(/requestFullscreen/)
    expect(src).toMatch(/exitFullscreen/)
    expect(src).toMatch(/nofullscreen/)
    expect(src).not.toMatch(/addEventListener|keydown|Escape|registerEscapeLayer|preventDefault/)
    expect(css).toMatch(/\.viewmark-fullscreen/)
    expect(css).toMatch(/max-width: 720px/)
    expect(css).toMatch(/:fullscreen/)
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
  })

  it('首屏、雾、T032、分享和禁项都不引用这个包', () => {
    const src = read('./fullscreen.ts')
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
      './shareShot.ts',
      './dock.tsx',
    ]
    for (const file of eager) {
      expect(read(file)).not.toMatch(/fullscreen|requestFullscreen|nofullscreen/)
    }
    expect(src).not.toMatch(/from ['"][^'"]*(shareShot|fog|cameraTransition|balancedFx|postfx|DemandLoop|Scene|three)/)
    expect(src).not.toMatch(/Reflector|transmission|Vignette|ssgi|pathtracer|jsdelivr|FloorBadges|postprocessing|FogExp2|smoothTime/i)
    const transition = read('../scene/stage/cameraTransition.ts')
    expect(transition).toMatch(/USER_CAMERA_SMOOTH_TIME = 0\.42/)
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
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
    ])
  })
})
