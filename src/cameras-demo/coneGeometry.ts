import { BufferAttribute, BufferGeometry, DoubleSide, MeshBasicMaterial } from 'three'
import { CAMERA_CONE_LENGTH, CAMERA_CONE_RADIUS } from './DEMO_cameras'

/**
 * 与楼体选中高亮同一档：高于默认楼板，低于徽标数字。
 * 数字留在这个分包里。须与楼体高亮那一档保持一致。
 */
export const CAMERA_CONE_ORDER = 9

/**
 * 尖在原点、沿 -Z 张开。顶点写在这个分包里，不从 three 取 ConeGeometry 绑定。
 */
class ConeGeometry extends BufferGeometry {
  constructor(radius: number, height: number, radialSegments: number) {
    super()
    const positions: number[] = [0, 0, 0, 0, 0, -height]
    const indices: number[] = []
    for (let i = 0; i < radialSegments; i += 1) {
      const theta = (i / radialSegments) * Math.PI * 2
      positions.push(Math.sin(theta) * radius, Math.cos(theta) * radius, -height)
    }
    for (let i = 0; i < radialSegments; i += 1) {
      const current = 2 + i
      const next = 2 + ((i + 1) % radialSegments)
      indices.push(0, next, current, 1, current, next)
    }
    this.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
    this.setIndex(indices)
    this.computeVertexNormals()
  }
}

export const CAMERA_CONE_COLOR = '#35c2ff'
export const CAMERA_CONE_SELECTED_COLOR = '#9ee6ff'
export const CAMERA_CONE_OPACITY = 0.3
export const CAMERA_CONE_SELECTED_OPACITY = 0.5

/**
 * ConeGeometry 默认尖朝 +Y、中心在原点。
 * 把尖挪到局部原点，再转到 -Z，heading 0 时朝北。
 */
export function createCameraConeGeometry(): ConeGeometry {
  const geometry = new ConeGeometry(CAMERA_CONE_RADIUS, CAMERA_CONE_LENGTH, 12)
  geometry.computeBoundingSphere()
  return geometry
}

/** 半透明、不写深度，让墙和楼板仍能挡住它。受雾影响，色值不进 AgX，昼夜都看得清。 */
export function createCameraConeMaterial(selected = false): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color: selected ? CAMERA_CONE_SELECTED_COLOR : CAMERA_CONE_COLOR,
    transparent: true,
    opacity: selected ? CAMERA_CONE_SELECTED_OPACITY : CAMERA_CONE_OPACITY,
    depthWrite: false,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
    fog: true,
  })
}
