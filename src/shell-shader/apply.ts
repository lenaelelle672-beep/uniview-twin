import { Mesh, type Material, type MeshStandardMaterial, type Object3D, type ShaderMaterial } from 'three'
import { SOLID_SHELL_METALNESS, SOLID_SHELL_ROUGHNESS, type ShellShaderMix } from './plan'

/**
 * T121：把楼壳叠色挂到已经使用 solidMaterial 的网格上。
 * 认的是粗糙度、金属度、空名字，和 applySurfaceMode 不改的那两项一致。
 * 不换父级材质，不改 visible，不改 raycast。子网格跟着父级走，爆炸不用另写矩阵。
 * 材质数组（裙楼壳）和有名字的克隆（剖切封盖）都不叠。
 * 父级材质已经带裁切面时卸掉叠色：自定义着色器没有裁切块，否则会画出被裁掉的实体。
 */

export const SHELL_TINT_NAME = 'ShellShaderTint'

const attached = new Set<Mesh>()

function ignoreShellTintPick() {
  // 不写入交点。父级实体壳仍按原来的射线。
}

export function isSolidShellMaterial(material: Material | Material[] | null | undefined): boolean {
  if (!material || Array.isArray(material)) return false
  const standard = material as MeshStandardMaterial
  if (standard.isMeshStandardMaterial !== true) return false
  if (standard.name) return false
  if (standard.stencilWrite) return false
  if (standard.transparent) return false
  if (Math.abs(standard.roughness - SOLID_SHELL_ROUGHNESS) > 1e-3) return false
  if (Math.abs(standard.metalness - SOLID_SHELL_METALNESS) > 1e-3) return false
  return true
}

export function solidShellClipped(material: Material | Material[] | null | undefined): boolean {
  if (!material || Array.isArray(material)) return false
  const planes = material.clippingPlanes
  return Array.isArray(planes) && planes.length > 0
}

export function isSolidShellMesh(object: Object3D): object is Mesh {
  const mesh = object as Mesh & { isInstancedMesh?: boolean }
  if (mesh.isMesh !== true) return false
  if (mesh.isInstancedMesh === true) return false
  if (mesh.name === SHELL_TINT_NAME) return false
  if (mesh.userData.boxPickProxy === true) return false
  if (mesh.userData.floorStencil === true) return false
  return isSolidShellMaterial(mesh.material)
}

function ensureTint(mesh: Mesh, material: ShaderMaterial): Mesh {
  let tint = mesh.children.find((child) => child.name === SHELL_TINT_NAME) as Mesh | undefined
  if (!tint || tint.isMesh !== true) {
    tint = new Mesh(mesh.geometry, material)
    tint.name = SHELL_TINT_NAME
    tint.userData.shellShader = true
    tint.raycast = ignoreShellTintPick as Mesh['raycast']
    mesh.add(tint)
  }
  if (tint.geometry !== mesh.geometry) tint.geometry = mesh.geometry
  tint.material = material
  tint.castShadow = false
  tint.receiveShadow = false
  tint.frustumCulled = mesh.frustumCulled
  tint.renderOrder = 2
  tint.layers.mask = mesh.layers.mask
  attached.add(tint)
  return tint
}

function dropTint(tint: Mesh): void {
  tint.parent?.remove(tint)
  attached.delete(tint)
}

/** 叠到实体壳上。两边强度都是 0 时不留网格。返回当前叠色网格数。 */
export function syncShellTints(scene: Object3D, material: ShaderMaterial, mixes: ShellShaderMix): number {
  if (mixes.alarm <= 0 && mixes.night <= 0) {
    releaseShellTints(scene)
    return 0
  }
  const keep = new Set<Mesh>()
  scene.traverse((object) => {
    if (!isSolidShellMesh(object)) return
    if (solidShellClipped(object.material)) return
    keep.add(ensureTint(object, material))
  })
  for (const tint of attached) {
    if (keep.has(tint)) continue
    dropTint(tint)
  }
  const shader = material as ShaderMaterial & { uAlarmMix: number; uNightMix: number }
  shader.uAlarmMix = mixes.alarm
  shader.uNightMix = mixes.night
  return keep.size
}

export function releaseShellTints(scene: Object3D): void {
  const leftover: Mesh[] = []
  scene.traverse((object) => {
    if (object.name === SHELL_TINT_NAME) leftover.push(object as Mesh)
  })
  for (const tint of leftover) dropTint(tint)
  attached.clear()
}

export function resetShellTintsForTests(): void {
  for (const tint of attached) tint.parent?.remove(tint)
  attached.clear()
}
