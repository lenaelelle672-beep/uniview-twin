/** 软件渲染识别。挂 R3F Canvas 之前用 1×1 临时 context 判档，再 loseContext。 */

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render driver/i

export type GpuDetectResult = {
  renderer: string
  software: boolean
  probeMs: number
}

export function keepDrawingBufferRequested(search = typeof location === 'undefined' ? '' : location.search): boolean {
  const raw = search.startsWith('?') ? search.slice(1) : search
  return new URLSearchParams(raw).get('keepDrawingBuffer') === '1'
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

/**
 * 只认 WEBGL_debug_renderer_info。拿不到扩展就保持现档（software=false）。
 * 正则不单写 warp，以免误伤正常显卡名。
 */
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

/**
 * 在创建 R3F Canvas / WebGLRenderer 之前判档。
 * preserveDrawingBuffer 只能在 context 创建时定死，onCreated 已经晚了。
 */
export function probeSoftwareGpu(): GpuDetectResult {
  if (cachedProbe) return cachedProbe
  const started = typeof performance !== 'undefined' ? performance.now() : 0
  if (typeof document === 'undefined') {
    cachedProbe = { renderer: '', software: false, probeMs: 0 }
    return cachedProbe
  }
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null
  try {
    gl =
      canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) ??
      canvas.getContext('webgl', { failIfMajorPerformanceCaveat: false })
  } catch {
    gl = null
  }
  const detected = gl
    ? detectSoftwareRenderer(gl)
    : { renderer: '', software: false, probeMs: 0 }
  try {
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    // SwiftShader 上丢掉探测 context，避免占着第二个 GL
  }
  const probeMs = typeof performance !== 'undefined' ? performance.now() - started : 0
  cachedProbe = { renderer: detected.renderer, software: detected.software, probeMs }
  return cachedProbe
}

/** 软件 GPU 且未带 ?keepDrawingBuffer=1 时关掉。不看 ?q= / ?cam= / 钩子。 */
export function preserveDrawingBufferFor(software: boolean, search?: string): boolean {
  return keepDrawingBufferRequested(search) || !software
}

export function gpuTierLabel(quality: 'perf' | 'balanced' | 'high'): 'performance' | 'balanced' | 'high' {
  return quality === 'perf' ? 'performance' : quality
}
