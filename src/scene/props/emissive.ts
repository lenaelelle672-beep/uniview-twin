export interface EmissiveTune {
  color: string
  intensity: number
}

/**
 * 夜景发光只改已有材质的 emissive，不新增网格。
 * sign_body 为弱蓝，强度低于字面；白天全部关掉。
 */
export function propNightEmissive(materialName: string, night: boolean): EmissiveTune {
  if (!night) return { color: '#000000', intensity: 0 }
  switch (materialName) {
    case 'lamp_light':
      return { color: '#fff4dc', intensity: 2.4 }
    case 'sign_face':
      return { color: '#f4f7ff', intensity: 1.6 }
    case 'sign_face_cn':
      return { color: '#2f6bff', intensity: 1.8 }
    case 'sign_body':
      return { color: '#8eb4ff', intensity: 0.42 }
    default:
      return { color: '#000000', intensity: 0 }
  }
}
