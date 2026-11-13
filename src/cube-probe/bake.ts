/**
 * 包住 CubeCamera.update：无论 drei 把内部计数重置多少次，真正的渲染只发生一次。
 * frames={1} 负责组件那一侧；这里是会话一侧的停表。
 */

interface EnvMaterial {
  clone: () => EnvMaterial
  envMap: unknown
  needsUpdate?: boolean
  name?: string
  dispose?: () => void
}

export interface EnvMesh {
  visible: boolean
  material: EnvMaterial | EnvMaterial[] | null
}

interface CubeObject {
  type?: string
  update?: (renderer: unknown, scene: unknown) => void
  children?: CubeObject[]
  userData?: { twinCubeArmed?: boolean; twinCubeRestore?: () => void }
}

interface CubeScene {
  getObjectByName?: (name: string) => CubeObject | undefined
}

export function armCubeUpdate(
  scene: CubeScene,
  mesh: EnvMesh,
  texture: unknown,
  onBaked: () => void,
): (() => void) | null {
  const root = scene.getObjectByName?.('CubeProbe')
  const cube = root?.children?.find((child) => child.type === 'CubeCamera' && typeof child.update === 'function')
  if (!cube || !cube.update) return null
  if (cube.userData?.twinCubeArmed && cube.userData.twinCubeRestore) return cube.userData.twinCubeRestore

  const original = cube.update.bind(cube)
  const previousMaterial = mesh.material
  const previousVisible = mesh.visible
  let ran = 0
  let clone: EnvMaterial | null = null

  const wrapped = (renderer: unknown, nextScene: unknown) => {
    if (ran >= 1) return
    ran += 1
    mesh.visible = false
    try {
      original(renderer, nextScene)
    } finally {
      mesh.visible = previousVisible
    }
    clone = assignEnv(mesh, texture)
    onBaked()
  }

  cube.update = wrapped
  const restore = () => {
    if (cube.update === wrapped) cube.update = original
    mesh.visible = previousVisible
    if (clone && mesh.material === clone) mesh.material = previousMaterial
    if (clone) {
      clone.envMap = null
      clone.dispose?.()
      clone = null
    }
    if (cube.userData) {
      delete cube.userData.twinCubeArmed
      delete cube.userData.twinCubeRestore
    }
  }
  cube.userData = cube.userData ?? {}
  cube.userData.twinCubeArmed = true
  cube.userData.twinCubeRestore = restore
  return restore
}

function assignEnv(mesh: EnvMesh, texture: unknown): EnvMaterial | null {
  const current = mesh.material
  if (!current || Array.isArray(current) || typeof current.clone !== 'function') return null
  if (!('envMap' in current)) return null
  const clone = current.clone()
  clone.envMap = texture
  clone.needsUpdate = true
  clone.name = 'twin-cube-probe'
  mesh.material = clone
  return clone
}
