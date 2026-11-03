/**
 * drei Cloud 把 speed / bounds / color 写进普通对象。
 * 生产分包不复用 fiber 的 applyProps（入口包没有把它导出），
 * 这里只覆盖 Cloud 实际会写的颜色、向量和标量。
 */

type ColorLike = { isColor: true; set: (value: unknown) => void }
type VectorLike = {
  isVector3: true
  set: (x: number, y: number, z: number) => void
  copy: (value: VectorLike) => void
}

function isColor(value: unknown): value is ColorLike {
  return !!value && typeof value === 'object' && (value as { isColor?: boolean }).isColor === true
}

function isVector(value: unknown): value is VectorLike {
  return !!value && typeof value === 'object' && (value as { isVector3?: boolean }).isVector3 === true
}

function isXYZ(value: unknown): value is { x: number; y: number; z: number } {
  if (!value || typeof value !== 'object') return false
  const point = value as { x?: unknown; y?: unknown; z?: unknown }
  return typeof point.x === 'number' && typeof point.y === 'number' && typeof point.z === 'number'
}

export function applyCloudProps(object: object, props: object): void {
  const target = object as Record<string, unknown>
  const source = props as Record<string, unknown>
  for (const key of Object.keys(source)) {
    const value = source[key]
    const current = target[key]
    if (isColor(current) && value != null) {
      current.set(value)
      continue
    }
    if (isVector(current) && value != null) {
      if (Array.isArray(value) && value.length >= 3) {
        current.set(Number(value[0]), Number(value[1]), Number(value[2]))
        continue
      }
      if (isVector(value)) {
        current.copy(value)
        continue
      }
      if (isXYZ(value)) {
        current.set(value.x, value.y, value.z)
        continue
      }
    }
    target[key] = value
  }
}
