import { Light, Scene, type Camera, type WebGLRenderer } from 'three'
import { supportsParallelShaderCompile } from '../glProbe'
import type { ShaderGroup } from './shaderGroups'

function addLightClones(source: Scene, target: Scene) {
  source.traverse((object) => {
    if (!(object as Light).isLight) return
    const clone = object.clone()
    clone.matrixAutoUpdate = false
    clone.matrixWorld.copy(object.matrixWorld)
    target.add(clone)
  })
}

/**
 * 只编译这一组占位物体。灯光/环境/雾从当前总览场景克隆，
 * 与进 F12 时同一套 hemisphere + ambient + directional（含阴影开关）。
 * 不 compile 整棵 live scene。
 */
export async function compileMaterialGroup(
  gl: WebGLRenderer,
  liveScene: Scene,
  camera: Camera,
  group: ShaderGroup,
): Promise<void> {
  const compileScene = new Scene()
  compileScene.environment = liveScene.environment
  compileScene.fog = liveScene.fog
  addLightClones(liveScene, compileScene)
  const built = group.build()
  for (const object of built.objects) {
    object.visible = false
    compileScene.add(object)
  }

  try {
    const renderer = gl as WebGLRenderer & {
      compileAsync?: (scene: Scene, camera: Camera) => Promise<void>
    }
    if (supportsParallelShaderCompile(gl) && typeof renderer.compileAsync === 'function') {
      await renderer.compileAsync(compileScene, camera)
    } else {
      gl.compile(compileScene, camera)
    }
  } finally {
    for (const object of built.objects) compileScene.remove(object)
    built.dispose()
    compileScene.clear()
  }
}

export function programCount(gl: WebGLRenderer): number {
  return gl.info.programs?.length ?? 0
}
