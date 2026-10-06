const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render driver/i

export type GpuDetectResult = {
  renderer: string
  software: boolean
}

export function keepDrawingBufferRequested(search = typeof location === 'undefined' ? '' : location.search): boolean {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('keepDrawingBuffer') === '1'
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
      return { renderer, software: false }
    }
    renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '')
    return { renderer, software: SOFTWARE.test(renderer) }
  } catch {
    return { renderer, software: false }
  }
}

/** D190：有 `?keepDrawingBuffer=1` 才 true；没有则所有档位都 false。 */
export function preserveDrawingBufferFor(search?: string): boolean {
  return keepDrawingBufferRequested(search)
}

export function gpuTierLabel(quality: 'perf' | 'balanced' | 'high'): 'performance' | 'balanced' | 'high' {
  return quality === 'perf' ? 'performance' : quality
}
