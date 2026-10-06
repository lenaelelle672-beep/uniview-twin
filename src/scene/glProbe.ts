import type { WebGLRenderer } from 'three'

const EMPTY_ERRORS: number[] = []
let cachedSamples: number | undefined

export function resetGlProbeCache(): void {
  cachedSamples = undefined
}

/** SAMPLES 创建时读一次。每帧 getParameter 在软渲染上会卡住主线程等 GPU。 */
export function defaultFramebufferSamples(gl: WebGLRenderer) {
  if (cachedSamples != null) return cachedSamples
  const ctx = gl.getContext()
  cachedSamples = Number(ctx.getParameter(ctx.SAMPLES) ?? 0)
  return cachedSamples
}

/** getError 只在 dev / __twinGlDebug。生产每帧 drain 会同步 GPU。 */
export function drainGlErrors(gl: WebGLRenderer) {
  const w = globalThis as unknown as Window
  const debug = import.meta.env.DEV || Boolean(w.__twinGlDebug)
  if (!debug) return EMPTY_ERRORS
  const ctx = gl.getContext()
  const codes: number[] = []
  for (let i = 0; i < 8; i += 1) {
    const code = ctx.getError()
    if (code === ctx.NO_ERROR) break
    codes.push(code)
  }
  return codes
}

export function supportsParallelShaderCompile(gl: WebGLRenderer) {
  const ctx = gl.getContext()
  const names = ctx.getSupportedExtensions() ?? []
  return names.includes('KHR_parallel_shader_compile')
}
