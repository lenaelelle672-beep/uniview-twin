/** 软件渲染识别。约 15 行，不另建上下文、不发请求。 */

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render driver/i

export type GpuDetectResult = {
  renderer: string
  software: boolean
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
      return { renderer, software: false }
    }
    renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? '')
    return { renderer, software: SOFTWARE.test(renderer) }
  } catch {
    return { renderer, software: false }
  }
}

export function gpuTierLabel(quality: 'perf' | 'balanced' | 'high'): 'performance' | 'balanced' | 'high' {
  return quality === 'perf' ? 'performance' : quality
}
