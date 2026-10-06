const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render driver/i

export type GpuDetectResult = {
  renderer: string
  software: boolean
  probeMs: number
}

export function keepDrawingBufferRequested(search = typeof location === 'undefined' ? '' : location.search): boolean {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('keepDrawingBuffer') === '1'
}

let cachedProbe: GpuDetectResult | undefined

export function resetGpuProbeCache(): void {
  cachedProbe = undefined
}

type GlLike = {
  getExtension: (name: string) => { UNMASKED_RENDERER_WEBGL: number } | null
  getParameter: (pname: number) => unknown
  RENDERER: number
}

export function detectSoftwareRenderer(gl: GlLike): GpuDetectResult {
  let renderer = ''
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    if (!ext) {
      renderer = String(gl.getParameter(gl.RENDERER) ?? '')
      return { renderer, software: false, probeMs: 0 }
    }
    renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '')
    return { renderer, software: SOFTWARE.test(renderer), probeMs: 0 }
  } catch {
    return { renderer, software: false, probeMs: 0 }
  }
}

/** 挂 Canvas 前 1×1 探测；onCreated 已晚，定不了 preserveDrawingBuffer。 */
export function probeSoftwareGpu(): GpuDetectResult {
  if (cachedProbe) return cachedProbe
  const started = performance.now()
  if (typeof document === 'undefined') {
    cachedProbe = { renderer: '', software: false, probeMs: 0 }
    return cachedProbe
  }
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null
  try {
    gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
  } catch {
    gl = null
  }
  const detected = gl ? detectSoftwareRenderer(gl) : { renderer: '', software: false, probeMs: 0 }
  try {
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {}
  cachedProbe = { renderer: detected.renderer, software: detected.software, probeMs: performance.now() - started }
  return cachedProbe
}

export function preserveDrawingBufferFor(software: boolean, search?: string): boolean {
  return keepDrawingBufferRequested(search) || !software
}

export function gpuTierLabel(quality: 'perf' | 'balanced' | 'high'): 'performance' | 'balanced' | 'high' {
  return quality === 'perf' ? 'performance' : quality
}
