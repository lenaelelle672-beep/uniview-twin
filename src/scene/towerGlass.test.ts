import { describe, expect, it } from 'vitest'
import { DoubleSide, FrontSide, Vector3 } from 'three'
import { curtainMaterial } from './materials'
import { createTowerGlass } from './towerGlass'

function faceNormal(geometry: ReturnType<typeof createTowerGlass>, triangle: number) {
  const index = geometry.getIndex()
  const position = geometry.getAttribute('position')
  if (!index) throw new Error('幕墙缺少索引')
  const a = new Vector3().fromBufferAttribute(position, index.getX(triangle))
  const b = new Vector3().fromBufferAttribute(position, index.getX(triangle + 1))
  const c = new Vector3().fromBufferAttribute(position, index.getX(triangle + 2))
  const midpoint = a.clone().add(b).add(c).multiplyScalar(1 / 3)
  const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize()
  return { midpoint, normal }
}

describe('塔楼幕墙绕序', () => {
  it('东西南北四面绕序朝外，幕墙材质保持正面', () => {
    const geometry = createTowerGlass(0, 6)
    const index = geometry.getIndex()
    expect(index).not.toBeNull()
    if (!index) return
    const outward = [
      { axis: 'x' as const, sign: 1, limit: 20 },
      { axis: 'x' as const, sign: -1, limit: 20 },
      { axis: 'z' as const, sign: 1, limit: 8 },
      { axis: 'z' as const, sign: -1, limit: 8 },
    ]
    const hits = [0, 0, 0, 0]
    for (let triangle = 0; triangle < index.count; triangle += 3) {
      const { midpoint, normal } = faceNormal(geometry, triangle)
      outward.forEach((face, faceIndex) => {
        const coord = midpoint[face.axis]
        if (face.sign > 0 ? coord > face.limit : coord < -face.limit) {
          const expected = new Vector3(
            face.axis === 'x' ? face.sign : 0,
            0,
            face.axis === 'z' ? face.sign : 0,
          )
          expect(normal.dot(expected)).toBeGreaterThan(0.9)
          hits[faceIndex] += 1
        }
      })
    }
    expect(hits.every((count) => count > 0)).toBe(true)
    expect(curtainMaterial.side).toBe(FrontSide)
    expect(curtainMaterial.side).not.toBe(DoubleSide)
    geometry.dispose()
  })
})
