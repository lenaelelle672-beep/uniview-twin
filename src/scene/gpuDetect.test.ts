import { describe, expect, it } from 'vitest'
import { detectSoftwareRenderer, gpuTierLabel } from './gpuDetect'

type Ext = { UNMASKED_RENDERER_WEBGL: number } | null

function fakeGl(renderer: string, ext: Ext | 'throw' = { UNMASKED_RENDERER_WEBGL: 0x9246 }) {
  return {
    RENDERER: 0x1f01,
    getExtension: (name: string) => {
      if (ext === 'throw') throw new Error('no ext')
      if (name !== 'WEBGL_debug_renderer_info') return null
      return ext
    },
    getParameter: (pname: number) => {
      if (ext && ext !== 'throw' && pname === ext.UNMASKED_RENDERER_WEBGL) return renderer
      if (pname === 0x1f01) return 'WebKit WebGL'
      return ''
    },
  }
}

describe('detectSoftwareRenderer', () => {
  it('匹配 SwiftShader / llvmpipe / softpipe / software / Basic Render Driver', () => {
    expect(
      detectSoftwareRenderer(
        fakeGl('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)'),
      ).software,
    ).toBe(true)
    expect(
      detectSoftwareRenderer(
        fakeGl('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'),
      ).software,
    ).toBe(true)
    expect(detectSoftwareRenderer(fakeGl('llvmpipe (LLVM 15, 256 bits)')).software).toBe(true)
    expect(detectSoftwareRenderer(fakeGl('softpipe')).software).toBe(true)
    expect(detectSoftwareRenderer(fakeGl('Google Software Renderer')).software).toBe(true)
    expect(
      detectSoftwareRenderer(
        fakeGl('ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)'),
      ).software,
    ).toBe(true)
  })

  it('不把普通显卡或单独的 warp 判成软件渲染', () => {
    expect(detectSoftwareRenderer(fakeGl('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060)')).software).toBe(false)
    expect(detectSoftwareRenderer(fakeGl('ANGLE (AMD, AMD Radeon RX 6800)')).software).toBe(false)
    expect(detectSoftwareRenderer(fakeGl('Apple M1 Pro')).software).toBe(false)
    expect(detectSoftwareRenderer(fakeGl('WARP adapter')).software).toBe(false)
  })

  it('拿不到扩展就保持现档，不报错', () => {
    expect(detectSoftwareRenderer(fakeGl('SwiftShader', null))).toEqual({
      renderer: 'WebKit WebGL',
      software: false,
    })
    expect(detectSoftwareRenderer(fakeGl('SwiftShader', 'throw'))).toEqual({
      renderer: '',
      software: false,
    })
  })

  it('gpuTierLabel 把 perf 写成 performance', () => {
    expect(gpuTierLabel('perf')).toBe('performance')
    expect(gpuTierLabel('balanced')).toBe('balanced')
    expect(gpuTierLabel('high')).toBe('high')
  })
})
