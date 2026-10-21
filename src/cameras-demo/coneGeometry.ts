import { ConeGeometry, DoubleSide, MeshBasicMaterial } from 'three'
import { BUILDING_HIGHLIGHT_ORDER } from '../scene/overlayOrder'
import { CAMERA_CONE_LENGTH, CAMERA_CONE_RADIUS } from './DEMO_cameras'

/**
 * 与楼体选中高亮同一档：高于默认楼板，低于徽标数字。
 * 数字留在首屏 overlayOrder 里，这里只引用，不新增一档。
 */
export const CAMERA_CONE_ORDER = BUILDING_HIGHLIGHT_ORDER

export const CAMERA_CONE_COLOR = '#35c2ff'
export const CAMERA_CONE_SELECTED_COLOR = '#9ee6ff'
export const CAMERA_CONE_OPACITY = 0.3
export const CAMERA_CONE_SELECTED_OPACITY = 0.5

/**
 * ConeGeometry 默认尖朝 +Y、中心在原点。
 * 把尖挪到局部原点，再转到 -Z，heading 0 时朝北。
 */
export function createCameraConeGeometry(): ConeGeometry {
  const geometry = new ConeGeometry(CAMERA_CONE_RADIUS, CAMERA_CONE_LENGTH, 12, 1, false)
  geometry.translate(0, -CAMERA_CONE_LENGTH / 2, 0)
  geometry.rotateX(Math.PI / 2)
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
