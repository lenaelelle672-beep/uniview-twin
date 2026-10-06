import { Group, WebGLRenderTarget, type Camera, type Object3D, type Scene, type WebGLRenderer } from 'three'
import { supportsParallelShaderCompile } from '../glProbe'

function renderTiny(gl: WebGLRenderer, scene: Scene, camera: Camera) {
  const target = new WebGLRenderTarget(8, 8)
  const previous = gl.getRenderTarget()
  const previousAutoClear = gl.autoClear
  gl.autoClear = true
  gl.shadowMap.needsUpdate = true
  gl.setRenderTarget(target)
  gl.render(scene, camera)
  gl.setRenderTarget(previous)
  gl.autoClear = previousAutoClear
  target.dispose()
}

export function programKeys(gl: WebGLRenderer): string[] {
  return (gl.info.programs ?? []).map((program) => program.cacheKey)
}

/**
 * 占位物体挂进当前场景，灯/阴影/雾/环境与进层一致。
 * compile 只针对这一组；再向 8×8 目标画一帧，把阴影 program 也编出来。
 */
export async function compileObjects(
  gl: WebGLRenderer,
  liveScene: Scene,
  camera: Camera,
  objects: Object3D[],
): Promise<void> {
  const host = new Group()
  host.name = 'TwinPrewarmHost'
  host.position.set(0, -420, 0)
  host.scale.setScalar(0.02)
  for (const object of objects) {
    object.visible = true
    host.add(object)
  }
  liveScene.add(host)

  const prevMask = camera.layers.mask
  camera.layers.enableAll()
  try {
    const renderer = gl as WebGLRenderer & {
      compileAsync?: (scene: Object3D, camera: Camera, targetScene?: Scene) => Promise<void>
    }
    if (supportsParallelShaderCompile(gl) && typeof renderer.compileAsync === 'function') {
      await renderer.compileAsync(host, camera, liveScene)
    } else {
      gl.compile(host, camera, liveScene)
    }
    renderTiny(gl, liveScene, camera)
  } finally {
    camera.layers.mask = prevMask
    liveScene.remove(host)
    host.clear()
  }
}

export async function compileMaterialGroup(
  gl: WebGLRenderer,
  liveScene: Scene,
  camera: Camera,
  group: { id: string; build: () => { objects: Object3D[]; dispose: () => void } },
): Promise<void> {
  const built = group.build()
  try {
    await compileObjects(gl, liveScene, camera, built.objects)
  } finally {
    built.dispose()
  }
}

export function programCount(gl: WebGLRenderer): number {
  return gl.info.programs?.length ?? 0
}
