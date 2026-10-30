import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { FOG_DENSITY } from '../scene/fog'
import {
  explodeEscapeAction,
  explodeKeyAction,
  explodeProgressKeyBlocked,
  stepExplodeStop,
  toggleExplodeProgress,
} from './steps'

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('爆炸档位', () => {
  it('方括号按 0、0.5、1 走，E 在收拢和完全展开之间切换', () => {
    expect(stepExplodeStop(0, 1)).toBe(0.5)
    expect(stepExplodeStop(0.5, 1)).toBe(1)
    expect(stepExplodeStop(1, 1)).toBe(1)
    expect(stepExplodeStop(0.2, 1)).toBe(0.5)
    expect(stepExplodeStop(0.8, -1)).toBe(0.5)
    expect(stepExplodeStop(0.5, -1)).toBe(0)
    expect(stepExplodeStop(0, -1)).toBe(0)
    expect(toggleExplodeProgress(0)).toBe(1)
    expect(toggleExplodeProgress(0.4)).toBe(0)
    expect(toggleExplodeProgress(1)).toBe(0)
    expect(explodeKeyAction({ key: 'e' })).toBe('toggle')
    expect(explodeKeyAction({ key: 'E' })).toBe('toggle')
    expect(explodeKeyAction({ key: '[' })).toBe('down')
    expect(explodeKeyAction({ key: ']' })).toBe('up')
    expect(explodeKeyAction({ key: 'f' })).toBeNull()
    expect(explodeKeyAction({ key: 'Escape' })).toBeNull()
  })

  it('单层滑杆聚焦或刚动过档位时，第一次 Esc 不返回总览', () => {
    const floor = { view: 'floor', sliderFocused: false, spare: false, busy: false }
    expect(explodeEscapeAction({ key: 'Escape', target: null }, { ...floor, sliderFocused: true })).toBe('blur')
    expect(explodeEscapeAction({ key: 'Escape', target: null }, { ...floor, spare: true })).toBe('swallow')
    expect(explodeEscapeAction({ key: 'Escape', target: null }, floor)).toBe('pass')
    expect(explodeEscapeAction({ key: 'Escape', target: null }, { ...floor, spare: true, view: 'building' })).toBe('pass')
    expect(explodeEscapeAction({ key: 'Escape', target: null }, { ...floor, spare: true, busy: true })).toBe('pass')
    expect(explodeEscapeAction({ key: '[', target: null }, { ...floor, spare: true })).toBe('pass')
    expect(
      explodeEscapeAction({ key: 'Escape', target: { tagName: 'INPUT' } }, { ...floor, spare: true }),
    ).toBe('pass')
    expect(
      explodeEscapeAction(
        { key: 'Escape', target: { tagName: 'INPUT', dataset: { explodeProgress: '1' } } },
        { ...floor, sliderFocused: true },
      ),
    ).toBe('blur')
  })

  it('输入框和带修饰键的时候放过，滑杆本身仍接手', () => {
    expect(explodeProgressKeyBlocked({ target: null })).toBe(false)
    expect(explodeProgressKeyBlocked({ target: { tagName: 'INPUT' } })).toBe(true)
    expect(explodeProgressKeyBlocked({ target: { tagName: 'INPUT', dataset: { explodeProgress: '1' } } })).toBe(false)
    expect(explodeProgressKeyBlocked({ target: { tagName: 'TEXTAREA' } })).toBe(true)
    expect(explodeProgressKeyBlocked({ repeat: true, target: null })).toBe(true)
    expect(explodeProgressKeyBlocked({ ctrlKey: true, target: null })).toBe(true)
    expect(explodeProgressKeyBlocked({ metaKey: true, target: null })).toBe(true)
    expect(explodeProgressKeyBlocked({ altKey: true, target: null })).toBe(true)
    expect(
      explodeProgressKeyBlocked({
        target: { tagName: 'BUTTON', closest: (selector) => (selector === 'dialog' ? {} : null) },
      }),
    ).toBe(true)
  })
})

describe('爆炸进度不进首屏依赖', () => {
  it('滑杆走晚加载入口，不新装包，也不把 KeyboardControls 或 Html 滑杆带进来', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)

    const dock = read('../viewmarks/dock.tsx')
    const plugin = read('../../scripts/explodeProgressPlugin.ts')
    const vite = read('../../vite.config.ts')
    const stage = read('../components/Stage.tsx')
    const layout = read('../components/scene/ExplodedLayout.tsx')
    const loop = read('../components/scene/DemandLoop.tsx')
    const mount = read('./mount.ts')
    const station = read('../station-explode/mount.ts')
    const explode = read('../scene/explode.ts')
    const view = read('../store/viewSlice.ts')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }
    const block = plugin.slice(plugin.indexOf('export const EXPLODE_PROGRESS_SOURCE_BLOCK'), plugin.indexOf('const ROOT'))
    const blockText = block.slice(block.indexOf('`') + 1, block.lastIndexOf('`'))

    expect(dock).toContain(blockText)
    expect(dock.replace(blockText, '')).not.toMatch(/mountExplodeProgress|explode-progress\/mount/)
    expect(plugin).toMatch(/name: 'explode-progress-after-hash'/)
    expect(plugin).toMatch(/assets\/ExplodeProgress\.js/)
    expect(plugin).toMatch(/KeyboardControls/)
    expect(vite).toMatch(/explodeProgressAfterHash\(\)/)
    expect(vite.indexOf('stationExplodeAfterHash()')).toBeLessThan(vite.indexOf('explodeProgressAfterHash()'))

    expect(stage).not.toMatch(/type="range"|KeyboardControls|@react-three\/drei/)
    expect(stage).toMatch(/setExploded\(!exploded\)/)
    expect(layout).toMatch(/stepExplodeMotion/)
    expect(layout).toMatch(/position\.y/)
    expect(layout).not.toMatch(/setMatrixAt\(/)
    expect(loop).toMatch(/stepExplodeMotion/)
    expect(loop).not.toMatch(/KeyboardControls|gsap|anime/)
    expect(mount).toMatch(/type = 'range'/)
    expect(mount).toMatch(/aria-label', '爆炸进度'/)
    expect(mount).toMatch(/stopPropagation/)
    expect(mount).toMatch(/spareEscape/)
    expect(station).toMatch(/syncWanted/)
    expect(mount).not.toMatch(/KeyboardControls|@react-three\/drei|from 'three'|gsap|anime|@react-spring/)
    expect(station).toMatch(/__twinExplodeFollow/)
    expect(station).toMatch(/setMatrixAt/)
    expect(explode).toMatch(/function stepExplodeMotion/)
    expect(explode).toMatch(/function stepStationExplodeMotion/)
    expect(explode).toMatch(/view !== 'floor'/)
    expect(explode).toMatch(/view !== 'building'/)
    expect(explode).toMatch(/__ea/)
    expect(explode).toMatch(/__es/)
    expect(view).toMatch(/explodeProgress/)
    expect(view).toMatch(/setExplodeProgress/)
    expect(view).not.toMatch(/explodeProgress:\s*0/)
    expect(view).toMatch(/\} as ViewSlice\)/)
    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies['@react-three/fiber']).toBe('9.8.1')
    expect(pkg.dependencies['@react-three/postprocessing']).toBe('3.1.3')
    expect(pkg.dependencies.gsap).toBeUndefined()
    expect(pkg.dependencies.animejs).toBeUndefined()
    expect(pkg.dependencies['@react-spring/three']).toBeUndefined()
    expect(Object.keys(pkg.dependencies)).toHaveLength(11)
  })
})
