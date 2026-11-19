import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useState, type ComponentType } from 'react'
import { DoubleSide, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { EAST_GRILLE_SHEET_MAX_X, eastFacadeBandsDueLatched } from '../../scene/eastFacadeBands'
import {
  EAST_GRILLE_HI,
  EAST_GRILLE_INTENSITY,
  EAST_GRILLE_LO,
  preloadEastGrilleHi,
} from '../../scene/eastGrilleAssets'
import { grilleMaterial } from '../../scene/materials'
import { commitShadowBake, shadowBakePending } from '../../scene/stage/shadowBake'
import { eastGrilleMount } from '../../scene/massing'
import { installMeshopt } from '../../scene/meshopt'
import type { QualityTier } from '../../types'

export { EAST_GRILLE_HI, EAST_GRILLE_INTENSITY, EAST_GRILLE_LO }

const SHEET_DISCARD_KEY = 'twin-east-grille-t140-sheet'

function injectTwinPos(shader: { vertexShader: string; fragmentShader: string }) {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <project_vertex>',
    `#include <project_vertex>
     vTwinPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
  )
  shader.vertexShader = shader.vertexShader.replace(
    '#include <common>',
    '#include <common>\nvarying vec3 vTwinPos;',
  )
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    '#include <common>\nvarying vec3 vTwinPos;',
  )
}

/** 丢掉贴墙玻璃片和上段背板，露出后衬幕墙；保留翅片、框和竖挺。 */
function installSheetDiscard(material: MeshStandardMaterial) {
  if (material.userData.twinSheetDiscard) return
  material.userData.twinSheetDiscard = true
  material.onBeforeCompile = (shader) => {
    injectTwinPos(shader)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `#include <opaque_fragment>
       if (vTwinPos.x < ${EAST_GRILLE_SHEET_MAX_X.toFixed(4)}) discard;`,
    )
  }
  material.customProgramCacheKey = () => SHEET_DISCARD_KEY
  material.needsUpdate = true
}

function tuneEastGrille(root: Object3D | null) {
  if (!root) return
  root.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    mesh.frustumCulled = false
    mesh.castShadow = true
    mesh.receiveShadow = true
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue
      if (material.name !== 'east_grille') continue
      material.envMapIntensity = EAST_GRILLE_INTENSITY
      material.side = DoubleSide
      installSheetDiscard(material)
      if (material.envMap !== grilleMaterial.envMap) {
        material.envMap = grilleMaterial.envMap
        material.needsUpdate = true
      }
      // hi/lo 两套都跟外壳切面走。只设 clippingPlanes 阴影 pass 不裁，必须 clipShadows。
      const planes = grilleMaterial.clippingPlanes
      const clipShadows = Boolean(planes && planes.length > 0)
      if (material.clippingPlanes !== planes || material.clipShadows !== clipShadows) {
        material.clippingPlanes = planes
        material.clipShadows = clipShadows
        material.needsUpdate = true
      }
      const depth = mesh.customDepthMaterial
      if (depth) {
        depth.clippingPlanes = planes
        depth.clipShadows = clipShadows
        depth.needsUpdate = true
      }
    }
  })
}

function cameraSettled(): boolean {
  // 不静态引用 cameraRest：那个包会跟格栅一起进首屏 cutoff。
  // 停稳模块写入同一个 window 标志。
  return window.__twinCameraRested === true
}

function bakeGrilleShadow(
  gl: { shadowMap: { autoUpdate: boolean; needsUpdate: boolean; enabled: boolean } },
  reason: string,
) {
  // 进层烘烤挂起时不另烘，包含出齐后的 D261 窗。窗关上且没有挂起时，hi 切换和昼夜再补。
  if (!gl.shadowMap.enabled || !cameraSettled() || shadowBakePending()) return
  commitShadowBake(gl, reason, { rested: true, interior: true, deferred: false })
}

function GrilleModel({ url }: { url: string }) {
  const gl = useThree((state) => state.gl)
  const gltf = useLoader(GLTFLoader, url, installMeshopt)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf])
  useLayoutEffect(() => {
    tuneEastGrille(scene)
    bakeGrilleShadow(gl, 'grille-cut')
  }, [gl, scene])
  useFrame(() => {
    const envChanged = scene.userData.twinGrilleEnv !== grilleMaterial.envMap
    let clipStale = false
    scene.traverse((child) => {
      const mesh = child as Mesh
      if (!mesh.isMesh) return
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const material of materials) {
        if (!(material instanceof MeshStandardMaterial) || material.name !== 'east_grille') continue
        const planes = grilleMaterial.clippingPlanes
        const clipShadows = Boolean(planes && planes.length > 0)
        if (material.clippingPlanes !== planes || material.clipShadows !== clipShadows) clipStale = true
      }
    })
    if (!envChanged && !clipStale) return
    tuneEastGrille(scene)
    scene.userData.twinGrilleEnv = grilleMaterial.envMap
    bakeGrilleShadow(gl, envChanged ? 'grille-env' : 'grille-cut')
  })
  return <primitive object={scene} />
}

const mountWorld = new Vector3()

function BalancedGrille() {
  const [near, setNear] = useState(false)
  const [hiReady, setHiReady] = useState(false)
  const mount = eastGrilleMount()
  useFrame(({ camera }) => {
    mountWorld.set(...mount.position)
    if (camera.position.distanceTo(mountWorld) < 90) setNear(true)
  })
  useEffect(() => {
    if (!near || hiReady) return
    preloadEastGrilleHi()
    const loader = new GLTFLoader()
    installMeshopt(loader)
    let cancelled = false
    loader.load(EAST_GRILLE_HI, () => {
      if (!cancelled) setHiReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [hiReady, near])
  // 不静态导入 drei Detailed，避免首屏多一个 327 B chunk。靠近后再只挂 hi。
  return <GrilleModel url={!near || !hiReady ? EAST_GRILLE_LO : EAST_GRILLE_HI} />
}

/**
 * 上段密肋单独分包：等 __twinReady + 首帧 + 2600ms，并且 firstPrefetch 已标记
 *（window.__twinPrefetchAt）后再 import，不要在模块顶预拉。
 * 否则会跟 EastGrille 首屏 chunk 一起进 hardGate（D1461），
 * 或在 firstPrefetch 前 1ms 起请求而被 D126 算进 cutoff（D1489）。
 */
function LateEastUpperGrilleFins() {
  const [Fins, setFins] = useState<ComponentType | null>(null)
  useEffect(() => {
    let cancelled = false
    let timer = 0
    const poll = () => {
      if (cancelled) return
      const due = eastFacadeBandsDueLatched(
        false,
        window.__twinReady === true,
        window.__twinFirstFrameAt,
        performance.now(),
      )
      if (due && window.__twinPrefetchAt != null) {
        void import('./EastUpperGrilleFins').then((mod) => {
          if (!cancelled) setFins(() => mod.EastUpperGrilleFins)
        })
        return
      }
      timer = window.setTimeout(poll, 200)
    }
    poll()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])
  if (!Fins) return null
  return <Fins />
}

export function EastGrille({ quality }: { quality: QualityTier }) {
  const mount = eastGrilleMount()
  return (
    <group name="EastGrilleRoot">
      <group name="EastGrille" position={mount.position} rotation={mount.rotation}>
        {quality === 'perf' ? <GrilleModel url={EAST_GRILLE_LO} /> : <BalancedGrille />}
      </group>
      <LateEastUpperGrilleFins />
    </group>
  )
}

export default EastGrille
