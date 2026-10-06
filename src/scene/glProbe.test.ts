import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultFramebufferSamples, drainGlErrors, resetGlProbeCache } from './glProbe'
import type { WebGLRenderer } from 'three'

function fakeGl(samples = 4) {
  const getParameter = vi.fn(() => samples)
  const getError = vi.fn(() => 0)
  return {
    getParameter,
    getError,
    gl: {
      getContext: () => ({ getParameter, getError, SAMPLES: 0x80a9, NO_ERROR: 0 }),
    } as unknown as WebGLRenderer,
  }
}

describe('glProbe', () => {
  afterEach(() => {
    resetGlProbeCache()
    delete (globalThis as unknown as Window).__twinGlDebug
  })

  it('SAMPLES 只读一次', () => {
    const { gl, getParameter } = fakeGl(8)
    expect(defaultFramebufferSamples(gl)).toBe(8)
    expect(defaultFramebufferSamples(gl)).toBe(8)
    expect(getParameter).toHaveBeenCalledTimes(1)
  })

  it('dev 下 getError 会读 GL', () => {
    const { gl, getError } = fakeGl()
    drainGlErrors(gl)
    expect(getError).toHaveBeenCalled()
  })
})
