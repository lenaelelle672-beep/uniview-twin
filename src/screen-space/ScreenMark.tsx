import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ScreenSpace } from '@react-three/drei/core/ScreenSpace'
import { useFrame, useThree } from '@react-three/fiber'
import { DataTexture, LinearFilter, Vector3, type Camera, type Group } from 'three'
import { useTwinStore } from '../store/store'
import {
  SCREEN_MARK_ACCENT,
  SCREEN_MARK_ANCHOR,
  SCREEN_MARK_DEPTH,
  SCREEN_MARK_FILL,
  SCREEN_MARK_HEIGHT,
  SCREEN_MARK_INK,
  SCREEN_MARK_LABEL,
  SCREEN_MARK_ORDER,
  SCREEN_MARK_PROGRESS_EPS,
  SCREEN_MARK_TEX_H,
  SCREEN_MARK_TEX_W,
  SCREEN_MARK_WIDTH,
  screenMarkOffset,
  screenMarkState,
  type ScreenMarkPlacement,
} from './plan'
import { publishScreenMark } from './probe'

const scratch = new Vector3()

/** 拾取、悬停、测距都穿过这块牌子。模块级同一个函数，避免每次提交都换 raycast。 */
function ignoreMarkPick() {
  // 不往 intersects 里推。
}

function paintMark(): DataTexture {
  const canvas = document.createElement('canvas')
  canvas.width = SCREEN_MARK_TEX_W
  canvas.height = SCREEN_MARK_TEX_H
  const context = canvas.getContext('2d')
  if (!context) throw new Error('屏幕标注画布创建失败')
  context.fillStyle = SCREEN_MARK_FILL
  context.fillRect(0, 0, SCREEN_MARK_TEX_W, SCREEN_MARK_TEX_H)
  context.fillStyle = SCREEN_MARK_ACCENT
  context.fillRect(0, 0, 14, SCREEN_MARK_TEX_H)
  context.fillStyle = SCREEN_MARK_INK
  context.font = '600 36px sans-serif'
  context.textBaseline = 'middle'
  context.fillText(SCREEN_MARK_LABEL, 28, SCREEN_MARK_TEX_H / 2)
  const pixels = context.getImageData(0, 0, SCREEN_MARK_TEX_W, SCREEN_MARK_TEX_H).data
  const texture = new DataTexture(new Uint8Array(pixels), SCREEN_MARK_TEX_W, SCREEN_MARK_TEX_H)
  texture.colorSpace = 'srgb'
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.flipY = true
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

function cameraSample(camera: Camera): { fov: number; aspect: number; near: number } | null {
  const candidate = camera as Camera & { isPerspectiveCamera?: boolean; fov?: number; aspect?: number; near?: number }
  if (candidate.isPerspectiveCamera !== true) return null
  if (typeof candidate.fov !== 'number' || typeof candidate.aspect !== 'number' || typeof candidate.near !== 'number') {
    return null
  }
  return { fov: candidate.fov, aspect: candidate.aspect, near: candidate.near }
}

/** 塔楼锚点投到相机平面。复用一只向量，不在帧里分配。 */
function projectAnchor(camera: Camera): ScreenMarkPlacement {
  const sample = cameraSample(camera)
  scratch.set(SCREEN_MARK_ANCHOR.x, SCREEN_MARK_ANCHOR.y, SCREEN_MARK_ANCHOR.z)
  scratch.applyMatrix4(camera.matrixWorldInverse)
  const viewZ = scratch.z
  scratch.set(SCREEN_MARK_ANCHOR.x, SCREEN_MARK_ANCHOR.y, SCREEN_MARK_ANCHOR.z)
  scratch.project(camera)
  return screenMarkOffset({
    viewZ,
    ndcX: scratch.x,
    ndcY: scratch.y,
    fov: sample?.fov ?? 0,
    aspect: sample?.aspect ?? 0,
    near: sample?.near ?? 0,
    depth: SCREEN_MARK_DEPTH,
  })
}

/**
 * T116：一枚 drei ScreenSpace 标注。
 * 子网格在相机前方的平面上，位置来自塔楼平面中心的投影，屏上尺寸不随距离变。
 * 分工记在 plan.ts 的 SCREEN_MARK_BOUNDS。不在帧回调里 invalidate。
 */
export function ScreenMark() {
  const invalidate = useThree((state) => state.invalidate)
  const view = useTwinStore((state) => state.view)
  const presentation = useTwinStore((state) => state.presentation)
  const exploded = useTwinStore((state) => state.exploded)
  const group = useRef<Group>(null)
  const [texture, setTexture] = useState<DataTexture | null>(null)
  const state = screenMarkState({ view, presentation, exploded, progress: null, optOut: false })
  const visible = state === 'on' && texture != null

  useEffect(() => {
    const next = paintMark()
    setTexture(next)
    return () => next.dispose()
  }, [])

  useEffect(() => {
    return () => {
      publishScreenMark({
        on: false,
        mounted: false,
        state: window.__twinScreenMark?.state ?? 'off-view',
        placement: 'hidden',
        x: 0,
        y: 0,
      })
      invalidate()
    }
  }, [invalidate])

  useLayoutEffect(() => {
    if (!visible) {
      publishScreenMark({ on: false, mounted: false, state, placement: 'hidden', x: 0, y: 0 })
      return
    }
    publishScreenMark({ on: true, mounted: true, state, placement: 'hidden', x: 0, y: 0 })
    invalidate()
  }, [invalidate, state, visible])

  useFrame(({ camera }) => {
    const node = group.current
    if (!node) return
    const liveProgress = window.__twinExplode?.progress
    if (typeof liveProgress === 'number' && liveProgress > SCREEN_MARK_PROGRESS_EPS) {
      node.visible = false
      publishScreenMark({ on: true, mounted: true, state: 'off-explode', placement: 'hidden', x: 0, y: 0 })
      return
    }
    const place = projectAnchor(camera)
    node.visible = place.visible
    if (place.visible) node.position.set(place.x, place.y, 0)
    publishScreenMark({
      on: true,
      mounted: true,
      state: 'on',
      placement: place.reason,
      x: place.x,
      y: place.y,
    })
  })

  if (!visible || !texture) return null

  return (
    <ScreenSpace depth={SCREEN_MARK_DEPTH} name="ScreenMarkSpace">
      <group ref={group} name="ScreenMark" visible={false}>
        <mesh raycast={ignoreMarkPick} frustumCulled={false} renderOrder={SCREEN_MARK_ORDER}>
          <planeGeometry args={[SCREEN_MARK_WIDTH, SCREEN_MARK_HEIGHT]} />
          <meshBasicMaterial map={texture} depthTest={false} depthWrite={false} fog={false} toneMapped={false} />
        </mesh>
      </group>
    </ScreenSpace>
  )
}
