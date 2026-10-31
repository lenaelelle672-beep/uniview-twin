/**
 * T103：SimReady 试吃目录。只放这 4 个本地 GLB，不拉整库。
 * 加载走仓库已有的 three GLTFLoader + MeshoptDecoder（installMeshopt）。
 * drei useGLTF 走的是 three-stdlib，src 里没有这条接线。
 */

export const SIMREADY_DIR = '/models/simready/'

export const SIMREADY_PROPS = [
  { id: 'box', file: 'box_cardboard_a01.glb', label: '纸箱' },
  { id: 'pallet', file: 'pallet_block_a01.glb', label: '托盘' },
  { id: 'cabinet', file: 'cabinet_file_d02.glb', label: '文件柜' },
  { id: 'rack', file: 'rack_large_empty_a01.glb', label: '货架' },
] as const

export const NVIDIA_SIMREADY_URL = 'https://huggingface.co/datasets/nvidia/simready-assets'
export const COMMUNITY_CONVERT_URL = 'https://huggingface.co/datasets/codepawl/simready-glb'
export const ATTRIBUTION_HREF = '/models/simready/ATTRIBUTION-CC-BY.md'

export const CREDIT_ZH = '部分道具模型源自 NVIDIA SimReady（经 community convert），署名 NVIDIA。'
export const CREDIT_EN = 'Some prop models derived from NVIDIA SimReady (community convert); credit NVIDIA.'

/**
 * 总览镜头在 z≈210。广场外缘约 z=115，东楼南缘约 z=108。
 * 道具放在南侧空地，不进楼体，爆炸时也不跟楼层走。
 */
export const TASTE_ANCHOR = { x: -4.55, z: 158 }
export const TASTE_GAP_M = 1.6
export const TASTE_GROUND_Y = 0.03

/** 比 1.5 m 小的道具放大到约 2.2 m，货架保持原尺寸。 */
export function tasteScale(size: { x: number; y: number; z: number }, minEdge = 1.5, target = 2.2): number {
  const edge = Math.max(size.x, size.y, size.z)
  if (!(edge > 0) || edge >= minEdge) return 1
  return target / edge
}

export function rowCenters(widths: readonly number[], gap: number, anchorX: number): number[] {
  if (widths.length === 0) return []
  const span = widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, widths.length - 1)
  let cursor = anchorX - span / 2
  return widths.map((width) => {
    const center = cursor + width / 2
    cursor += width + gap
    return center
  })
}

/** 缺省打开。`?simready=0` 或 `off` 不请求 GLB。 */
export function tasteEnabled(search: string): boolean {
  const query = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const flag = query.get('simready')
  return flag !== '0' && flag !== 'off'
}
