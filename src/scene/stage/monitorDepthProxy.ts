import {
  CapsuleGeometry,
  DoubleSide,
  FrontSide,
  InstancedBufferAttribute,
  InstancedMesh,
  Material,
  Matrix4,
  MeshDepthMaterial,
  Object3D,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Side,
} from 'three'

const unitScale = new Vector3(1, 1, 1)
const composePosition = new Vector3()
const composeQuaternion = new Quaternion()

export function configureDepthProxyMaterial(
  material: MeshDepthMaterial,
  source: Material | Material[] | undefined,
  forceDoubleSide = false,
) {
  const src = Array.isArray(source) ? source[0] : source
  material.colorWrite = false
  material.depthWrite = true
  material.side = forceDoubleSide ? DoubleSide : ((src?.side as Side | undefined) ?? FrontSide)
  const alphaTest = src && 'alphaTest' in src ? Number(src.alphaTest) : 0
  material.alphaTest = Number.isFinite(alphaTest) && alphaTest > 0 ? alphaTest : 0
}

export function bindSharedInstancedProxy(proxy: InstancedMesh, source: InstancedMesh) {
  proxy.geometry = source.geometry
  proxy.instanceMatrix = source.instanceMatrix
  proxy.count = source.count
}

/** 解开共享引用，避免代理卸载时 dispose 源几何 / instanceMatrix。 */
export function releaseSharedInstancedProxy(proxy: InstancedMesh, placeholder: BufferGeometry) {
  proxy.geometry = placeholder
  proxy.count = 0
  proxy.instanceMatrix = new InstancedBufferAttribute(new Float32Array(16), 16)
}

export function attachProxyBesideSource(proxy: Object3D, source: Object3D) {
  if (!source.parent) return
  if (proxy.parent !== source.parent) source.parent.add(proxy)
  proxy.position.copy(source.position)
  proxy.quaternion.copy(source.quaternion)
  proxy.scale.copy(source.scale)
}

export function writePersonInstanceMatrix(person: Object3D, target: Matrix4) {
  composePosition.copy(person.position)
  composeQuaternion.copy(person.quaternion)
  target.compose(composePosition, composeQuaternion, unitScale)
}

export function createPersonCapsuleGeometry() {
  const radius = 0.2
  const length = 1.3
  const geometry = new CapsuleGeometry(radius, length, 3, 6)
  geometry.translate(0, length / 2 + radius, 0)
  return geometry
}
