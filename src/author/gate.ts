import { demoEditRequested } from '../demo-edit/flag'

/**
 * T066 灯光/相机辅助，和以后的 T068 矩形面光共用这道门。
 * 观众路径默认关：地址栏没有 `?demoEdit=1`，图层上也没有 `debugHelpers`。
 * 这道门不创建 RectAreaLight，也不读雾、后处理或镜头平滑时间。
 */
export function debugHelpersEnabled(layers: object | null | undefined): boolean {
  if (!layers) return false
  return (layers as { debugHelpers?: boolean }).debugHelpers === true
}

export function authorModeOn(input?: {
  search?: string
  navigation?: string
  layers?: object | null
}): boolean {
  if (debugHelpersEnabled(input?.layers)) return true
  return demoEditRequested(input?.search ?? '') || demoEditRequested(input?.navigation ?? '')
}
