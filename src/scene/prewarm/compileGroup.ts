import { Group, type Camera, type Object3D, type Scene, type WebGLRenderer } from 'three'
import { supportsParallelShaderCompile } from '../glProbe'

export interface ProgramSnap {
  name: string
  cacheKey: string
}

export function programKeys(gl: WebGLRenderer): string[] {
  return (gl.info.programs ?? []).map((program) => program.cacheKey)
}

export function snapshotPrograms(gl: WebGLRenderer, label: string): ProgramSnap[] {
  const snap = (gl.info.programs ?? []).map((program) => ({
    name: program.name,
    cacheKey: program.cacheKey,
  }))
  const bag = window.__twinProgramSnaps ?? (window.__twinProgramSnaps = {})
  bag[label] = snap
  return snap
}

function bindComposerTarget(gl: WebGLRenderer) {
  const previous = gl.getRenderTarget()
  const target = window.__twinComposerInput
  if (target) gl.setRenderTarget(target)
  return () => {
    gl.setRenderTarget(previous)
  }
}

/**
 * 占位物体挂进当前场景，灯/阴影/雾/环境走第三个参数 liveScene。
 * 均衡档先绑 composer.inputBuffer，避免 RT=null 编出 sRGB / AgX 另一套 cacheKey。
 * 阴影深度 program 不在 compile 覆盖范围内，不强求。
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
  const restoreTarget = bindComposerTarget(gl)
  try {
    const renderer = gl as WebGLRenderer & {
      compileAsync?: (scene: Object3D, camera: Camera, targetScene?: Scene) => Promise<void>
    }
    if (supportsParallelShaderCompile(gl) && typeof renderer.compileAsync === 'function') {
      await renderer.compileAsync(host, camera, liveScene)
    } else {
      gl.compile(host, camera, liveScene)
    }
  } finally {
    restoreTarget()
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
