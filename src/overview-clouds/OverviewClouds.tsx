import { useLayoutEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { Cloud, Clouds } from '@react-three/drei/core/Cloud'
import { DoubleSide, MeshBasicMaterial, type Group } from 'three'
import { useTwinStore } from '../store/store'
import { tolerateEmptyInstanceMaterial } from './emptyInstanceMaterial'
import {
  LOCAL_CLOUD_TEXTURE,
  OVERVIEW_CLOUD_FADE,
  OVERVIEW_CLOUD_GROWTH,
  OVERVIEW_CLOUD_LIMIT,
  OVERVIEW_CLOUD_SPEED,
  OVERVIEW_CLOUDS,
  overviewCloudsVisible,
} from './plan'

/**
 * 不参与拾取。云片挡在楼前时，点击仍落到场地和楼板。
 * 模块级同一个函数，避免每次提交都换 raycast。
 */
function ignoreCloudPick() {
  // 不往 intersects 里推。
}

/**
 * 无光照的卡片。Cloud 自己的材质类会再包一层，把每片的透明度乘进片元。
 * 正面朝着相机，双面是为了朝向还没写上的那一帧也不至于整团消失。
 */
class OverviewCloudMaterial extends MeshBasicMaterial {
  constructor() {
    super()
    this.transparent = true
    this.depthWrite = false
    this.depthTest = true
    this.side = DoubleSide
    this.fog = false
    this.premultipliedAlpha = false
  }
}

function publishMounted(mounted: boolean): void {
  window.__twinOverviewClouds = {
    on: mounted,
    mounted,
    texture: LOCAL_CLOUD_TEXTURE,
    speed: OVERVIEW_CLOUD_SPEED,
    growth: OVERVIEW_CLOUD_GROWTH,
    limit: OVERVIEW_CLOUD_LIMIT,
    count: OVERVIEW_CLOUDS.length,
    segments: OVERVIEW_CLOUD_LIMIT,
    impl: 'drei-cloud',
    cdn: false,
  }
}

/**
 * T106：drei `<Clouds>` / `<Cloud>`。
 * 贴图只走本地 public 路径。speed 与 growth 都是 0。
 * 这里不注册逐帧回调，也不在回调里 invalidate，demand 停住之后云就停在那一帧。
 * 挂上时补一帧，再让出一帧，让实例矩阵读到已经更新的世界矩阵。
 */
export function OverviewClouds() {
  const invalidate = useThree((state) => state.invalidate)
  const scene = useThree((state) => state.scene)
  const root = useRef<Group>(null)
  tolerateEmptyInstanceMaterial(scene)
  const view = useTwinStore((state) => state.view)
  const dayNight = useTwinStore((state) => state.dayNight)
  const presentation = useTwinStore((state) => state.presentation)
  const visible = overviewCloudsVisible({ view, dayNight, presentation })

  useLayoutEffect(() => {
    publishMounted(visible)
    if (!visible) {
      invalidate()
      return
    }
    const group = root.current
    group?.traverse((obj) => {
      obj.raycast = ignoreCloudPick
    })
    group?.updateWorldMatrix(true, true)
    invalidate()
    const follow = requestAnimationFrame(() => {
      const live = root.current
      live?.traverse((obj) => {
        obj.raycast = ignoreCloudPick
      })
      live?.updateWorldMatrix(true, true)
      invalidate()
    })
    return () => {
      cancelAnimationFrame(follow)
    }
  }, [invalidate, visible])

  useLayoutEffect(() => {
    return () => {
      publishMounted(false)
      invalidate()
    }
  }, [invalidate])

  if (!visible) return null

  return (
    <group ref={root} name="OverviewClouds">
      <Clouds
        texture={LOCAL_CLOUD_TEXTURE}
        limit={OVERVIEW_CLOUD_LIMIT}
        material={OverviewCloudMaterial}
        frustumCulled={false}
      >
        {OVERVIEW_CLOUDS.map((cloud) => (
          <Cloud
            key={cloud.seed}
            seed={cloud.seed}
            speed={OVERVIEW_CLOUD_SPEED}
            growth={OVERVIEW_CLOUD_GROWTH}
            segments={cloud.segments}
            bounds={cloud.bounds}
            volume={cloud.volume}
            opacity={cloud.opacity}
            color={cloud.color}
            fade={OVERVIEW_CLOUD_FADE}
            position={cloud.position}
            concentrate="inside"
          />
        ))}
      </Clouds>
    </group>
  )
}
