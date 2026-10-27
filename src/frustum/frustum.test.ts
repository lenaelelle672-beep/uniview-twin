import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FOG_DENSITY } from '../scene/fog'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { FRUSTUM_SOURCE_BLOCK } from '../../scripts/frustumPlugin'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

describe('T076 useIntersect 划界', () => {
  it('懒挂在 dock 哈希之后，不进首屏，不改雾和 T032', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(read('../scene/stage/cameraTransition.ts')).toMatch(/USER_CAMERA_SMOOTH_TIME = 0\.42/)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)

    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const live = read('./BlinkFrustum.tsx')
    const gate = read('./blinkGate.ts')
    const plan = read('./plan.ts')
    const loop = read('./loopBind.tsx')
    const plugin = read('../../scripts/frustumPlugin.ts')
    const vite = read('../../vite.config.ts')
    const badges = read('../scene/stage/DeviceBadges.tsx')
    const flash = read('../scene/stage/DeskFlash.tsx')
    const pause = read('../scene/offscreenPause.ts')
    const detailed = read('../scene/props/TreeLod.tsx')
    const demand = read('../components/scene/DemandLoop.tsx')
    const scene = read('../components/Scene.tsx')
    const fx = read('../components/scene/postfx/balancedFx.tsx')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }

    expect(dock).toContain(FRUSTUM_SOURCE_BLOCK.trimEnd())
    expect(dock).toMatch(/import\('\.\.\/frustum\/mount'\)/)
    expect(dock).toMatch(/mountFrustumPause\(\)/)
    expect(dock).not.toMatch(/from '\.\.\/frustum\/mount'/)
    expect(plugin).toContain(FRUSTUM_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'frustum-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/FrustumMount\.js/)
    expect(plugin).toMatch(/assets\/BlinkFrustum\.js/)
    expect(vite).toMatch(/frustumAfterHash/)

    expect(mount).toMatch(/import\('\.\/BlinkFrustum'\)/)
    expect(mount).not.toMatch(/useIntersect|@react-three\/drei|IntersectionObserver|Detailed/)
    expect(live).toMatch(/@react-three\/drei\/core\/useIntersect\.js/)
    expect(live).toMatch(/useIntersect/)
    expect(live).not.toMatch(/from '@react-three\/drei'['"]/)
    expect(live).not.toMatch(/IntersectionObserver|watchCanvasOffscreen|Detailed|hls|VideoTexture|useCursor|meshBounds|\bClone\b/)
    expect(live).toMatch(/invalidate\(\)/)
    expect(live).toMatch(/requestAnimationFrame/)
    expect(live).not.toMatch(/threshold/)
    expect(gate).not.toMatch(/@react-three|from 'three'|useIntersect|IntersectionObserver|FogExp2/)
    expect(plan).not.toMatch(/@react-three|from 'three'|useIntersect|IntersectionObserver/)
    expect(loop).not.toMatch(/useIntersect|IntersectionObserver|Detailed/)

    expect(badges).toMatch(/blinkLive\('alarm'\)/)
    expect(badges).not.toMatch(/useIntersect|IntersectionObserver|Detailed/)
    expect(flash).toMatch(/blinkLive\('flash'\)/)
    expect(flash).toMatch(/const FLASH_MS = 3000/)
    expect(flash).toMatch(/#ff6a00/)
    expect(flash).toMatch(/#ff8a00/)
    expect(flash).not.toMatch(/useIntersect|Outlines|IntersectionObserver/)

    expect(pause).toMatch(/IntersectionObserver/)
    expect(pause).not.toMatch(/useIntersect/)
    expect(detailed).toMatch(/Detailed/)
    expect(detailed).not.toMatch(/useIntersect/)
    expect(demand).not.toMatch(/useIntersect|frustum\/mount|mountFrustumPause/)
    expect(scene).not.toMatch(/useIntersect|mountFrustumPause/)
    expect(fx).not.toMatch(/useIntersect|hls|VideoTexture/)
    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies['three']).toBe('0.186.1')
  })
})
