export interface EmissiveTune {
  color: string
  intensity: number
}

/**
 * 夜景发光只改已有材质的 emissive，不新增网格。
 * sign_body 为弱蓝，强度低于字面；白天全部关掉。
 * T027 夜景强度：lamp_light 2.8（≤3.0）、sign_face 2.0（≤2.2）、
 * sign_face_cn 2.1（小幅，不冲蓝）、sign_body 0.5。
 */
export function propNightEmissive(materialName: string, night: boolean): EmissiveTune {
  if (!night) return { color: '#000000', intensity: 0 }
  switch (materialName) {
    case 'lamp_light':
      return { color: '#fff4dc', intensity: 2.8 }
    case 'sign_face':
      return { color: '#f4f7ff', intensity: 2.0 }
    case 'sign_face_cn':
      return { color: '#2f6bff', intensity: 2.1 }
    case 'sign_body':
      return { color: '#8eb4ff', intensity: 0.5 }
    default:
      return { color: '#000000', intensity: 0 }
  }
}
