import type { WebGLRenderer } from 'three'

export function defaultFramebufferSamples(gl: WebGLRenderer) {
  const ctx = gl.getContext()
  return Number(ctx.getParameter(ctx.SAMPLES) ?? 0)
}

export function drainGlErrors(gl: WebGLRenderer) {
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
