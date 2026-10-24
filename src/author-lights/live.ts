import { RectAreaLight, type Object3D } from 'three'
import { RectAreaLightHelper } from 'three/examples/jsm/helpers/RectAreaLightHelper.js'
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js'
import { RECT_AREA_CAP, cappedRectAreas, type RectAreaSpec } from './plan'

/**
 * T068：RectAreaLight + RectAreaLightHelper。
 * three 的 WebGL 面光要先把 LTC 贴图写进渲染器那份 UniformsLib。
 * 辅助体是 examples/jsm 的 RectAreaLightHelper，挂在灯下面。不使用 useHelper。
 */

let uniformsReady = false

function ignoreRaycast() {
  // 线框不参加拾取，点击继续落到场地和楼板。
}

export function ensureRectAreaUniforms(): void {
  if (uniformsReady) return
  RectAreaLightUniformsLib.init()
  uniformsReady = true
}

export interface RectAreaHandle {
  init: true
  cap: number
  count: number
  ids: string[]
  detach: () => void
}

export function attachRectAreaLights(scene: Object3D, specs: readonly RectAreaSpec[] = cappedRectAreas()): RectAreaHandle {
  ensureRectAreaUniforms()
  const chosen = specs.slice(0, RECT_AREA_CAP)
  const lights: RectAreaLight[] = []

  for (const spec of chosen) {
    const light = new RectAreaLight(spec.color, spec.intensity, spec.width, spec.height)
    light.name = `AuthorRectArea.${spec.id}`
    light.castShadow = false
    light.position.set(spec.position[0], spec.position[1], spec.position[2])
    light.lookAt(spec.target[0], spec.target[1], spec.target[2])

    const helper = new RectAreaLightHelper(light)
    helper.name = `AuthorRectAreaHelper.${spec.id}`
    helper.raycast = ignoreRaycast
    const face = helper.children[0]
    if (face) face.raycast = ignoreRaycast
    light.add(helper)
    scene.add(light)
    light.updateMatrixWorld(true)
    lights.push(light)
  }

  return {
    init: true,
    cap: RECT_AREA_CAP,
    count: lights.length,
    ids: chosen.map((spec) => spec.id),
    detach() {
      for (const light of lights) {
        const helper = light.children.find((child) => child.name.startsWith('AuthorRectAreaHelper.'))
        if (helper && 'dispose' in helper && typeof helper.dispose === 'function') helper.dispose()
        scene.remove(light)
      }
      lights.length = 0
    },
  }
}
