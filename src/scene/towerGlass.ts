import { PlaneGeometry, Vector3, type BufferGeometry, type NormalBufferAttributes } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { TOWER } from './siteGeometry'

const BAND = 0.78

/**
 * 正面朝外。若旋转后法线仍朝内，反转三角形绕序。
 * 幕墙材质保持 FrontSide，不用 DoubleSide。
 */
function faceOutward(geometry: PlaneGeometry, outward: Vector3) {
  const attribute = geometry.getAttribute('normal') as NormalBufferAttributes['normal']
  const normal = new Vector3().fromBufferAttribute(attribute, 0)
  if (normal.dot(outward) >= 0) return
  const index = geometry.getIndex()
  if (!index) throw new Error('幕墙缺少索引，无法翻转绕序')
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i)
    const c = index.getX(i + 2)
    index.setX(i, c)
    index.setX(i + 2, a)
  }
  geometry.computeVertexNormals()
}

export function createTowerGlass(elevation: number, height: number): BufferGeometry {
  const width = TOWER.maxX - TOWER.minX
  const depth = TOWER.maxZ - TOWER.minZ
  const glassHeight = height - BAND
  const y = elevation + BAND + glassHeight / 2
  const inset = 0.06

  const south = new PlaneGeometry(width, glassHeight)
  south.translate(0, y, TOWER.maxZ - inset)
  faceOutward(south, new Vector3(0, 0, 1))

  const north = new PlaneGeometry(width, glassHeight)
  north.rotateY(Math.PI)
  north.translate(0, y, TOWER.minZ + inset)
  faceOutward(north, new Vector3(0, 0, -1))

  const east = new PlaneGeometry(depth, glassHeight)
  east.rotateY(Math.PI / 2)
  east.translate(TOWER.maxX - inset, y, 0)
  faceOutward(east, new Vector3(1, 0, 0))

  const west = new PlaneGeometry(depth, glassHeight)
  west.rotateY(-Math.PI / 2)
  west.translate(TOWER.minX + inset, y, 0)
  faceOutward(west, new Vector3(-1, 0, 0))

  const merged = mergeGeometries([south, north, east, west])
  ;[south, north, east, west].forEach((geometry) => geometry.dispose())
  if (!merged) throw new Error('楼层幕墙为空')
  return merged
}
