import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assetOverlayVisible, blankSuspenseCount, resetBlankSuspense, retainBlankSuspense } from './assetLoad'

describe('加载反馈', () => {
  it('空白 Suspense 计数随 fallback 挂卸变化，不影响 ready', () => {
    resetBlankSuspense()
    expect(blankSuspenseCount()).toBe(0)
    const releaseA = retainBlankSuspense()
    const releaseB = retainBlankSuspense()
    expect(blankSuspenseCount()).toBe(2)
    releaseA()
    expect(blankSuspenseCount()).toBe(1)
    releaseB()
    releaseB()
    expect(blankSuspenseCount()).toBe(0)
  })

  it('就绪后的背景加载不再盖住画面，进层空白仍盖', () => {
    expect(assetOverlayVisible({ blanks: 1, loading: false, ready: false })).toBe(true)
    expect(assetOverlayVisible({ blanks: 0, loading: true, ready: false })).toBe(true)
    expect(assetOverlayVisible({ blanks: 0, loading: false, ready: false })).toBe(false)
    expect(assetOverlayVisible({ blanks: 0, loading: true, ready: true })).toBe(false)
    expect(assetOverlayVisible({ blanks: 1, loading: true, ready: true })).toBe(true)
  })

  it('用 drei useProgress，不写 __twinReady，不挡指针', () => {
    const overlay = readFileSync(new URL('../components/AssetLoadOverlay.tsx', import.meta.url), 'utf8')
    const bridge = readFileSync(new URL('../components/AssetLoadProgress.tsx', import.meta.url), 'utf8')
    const scene = readFileSync(new URL('../components/Scene.tsx', import.meta.url), 'utf8')
    const floor = readFileSync(new URL('./stage/FloorStage.tsx', import.meta.url), 'utf8')
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
    expect(bridge).toMatch(/@react-three\/drei\/core\/Progress/)
    expect(bridge).toMatch(/useProgress/)
    expect(overlay).toMatch(/import\('\.\/AssetLoadProgress'\)/)
    expect(overlay).not.toMatch(/@react-three\/drei\/core\/Progress/)
    expect(overlay).not.toMatch(/__twinReady\s*=\s*(?![=])/)
    expect(overlay).not.toMatch(/from '@react-three\/drei\/web\/Loader'/)
    expect(bridge).not.toMatch(/from '@react-three\/drei\/web\/Loader'/)
    expect(scene).toMatch(/<Suspense fallback={<BlankSuspenseFallback \/>}>/)
    expect(floor).toMatch(/<Suspense fallback={<BlankSuspenseFallback \/>}>/)
    expect(css).toMatch(/\.asset-load[\s\S]*pointer-events:\s*none/)
  })
})
