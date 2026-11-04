import { useLayoutEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { GradientTexture } from '@react-three/drei/core/GradientTexture'
import { BackSide, type Camera, type Object3D } from 'three'
import { useTwinStore } from '../store/store'
import {
  detectForeignSky,
  GRADIENT_SKY_COLORS,
  GRADIENT_SKY_HEIGHT_SEGMENTS,
  GRADIENT_SKY_ORDER,
  GRADIENT_SKY_RADIUS,
  GRADIENT_SKY_SIZE,
  GRADIENT_SKY_STOPS,
  GRADIENT_SKY_WIDTH,
  GRADIENT_SKY_WIDTH_SEGMENTS,
  gradientSkyState,
} from './plan'
import { publishGradientSky } from './probe'

/** 拾取、悬停、测距都穿过天幕。模块级同一个函数，避免每次提交都换 raycast。 */
function ignoreSkyPick() {
  // 不往 intersects 里推。
}

/**
 * 只搬平移，不转向：渐变始终按世界的上方取色。
 * three 在 onBeforeRender 之后才用 matrixWorld 算 modelView，这一帧就生效，不需要再要帧。
 */
function followCamera(this: Object3D, _renderer: unknown, _scene: unknown, camera: Camera) {
  this.matrixWorld.copyPosition(camera.matrixWorld)
}

/** GradientTexture 的 stops 变了才重画 canvas，所以传模块级的同一份数组。 */
const STOPS = GRADIENT_SKY_STOPS as number[]
const COLORS = GRADIENT_SKY_COLORS as string[]

/**
 * T114：drei GradientTexture 贴在跟随相机的背面球上。
 * 不写 scene.background，也不碰 scene.environment；清屏色仍在，只是被天幕盖住。
 * toneMapped 保持默认：性能档由渲染器、均衡档由合成器各做一次 AgX，两档上屏同色。
 * 不注册逐帧回调，demand 停住之后不续帧。
 */
export function GradientSky() {
  const invalidate = useThree((state) => state.invalidate)
  const scene = useThree((state) => state.scene)
  const view = useTwinStore((state) => state.view)
  const dayNight = useTwinStore((state) => state.dayNight)
  const presentation = useTwinStore((state) => state.presentation)
  const state = gradientSkyState({ view, dayNight, presentation, optOut: false }, detectForeignSky(scene))
  const visible = state === 'on'

  useLayoutEffect(() => {
    publishGradientSky(true, visible, state)
    invalidate()
  }, [invalidate, state, visible])

  useLayoutEffect(() => {
    return () => {
      publishGradientSky(false, false, window.__twinGradientSky?.state ?? 'off-view')
      invalidate()
    }
  }, [invalidate])

  if (!visible) return null

  return (
    <mesh
      name="GradientSky"
      renderOrder={GRADIENT_SKY_ORDER}
      frustumCulled={false}
      raycast={ignoreSkyPick}
      onBeforeRender={followCamera}
    >
      <sphereGeometry args={[GRADIENT_SKY_RADIUS, GRADIENT_SKY_WIDTH_SEGMENTS, GRADIENT_SKY_HEIGHT_SEGMENTS]} />
      <meshBasicMaterial side={BackSide} depthWrite={false} depthTest={false} fog={false} dithering>
        <GradientTexture stops={STOPS} colors={COLORS} size={GRADIENT_SKY_SIZE} width={GRADIENT_SKY_WIDTH} />
      </meshBasicMaterial>
    </mesh>
  )
}
