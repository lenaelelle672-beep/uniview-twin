import { useFrame, useLoader, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { DoubleSide, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  EAST_GRILLE_HI,
  EAST_GRILLE_INTENSITY,
  EAST_GRILLE_LO,
  preloadEastGrilleHi,
} from '../../scene/eastGrilleAssets'
import { grilleMaterial } from '../../scene/materials'
import { isCameraRested } from '../../scene/stage/cameraRest'
import { commitShadowBake, shadowBakePending } from '../../scene/stage/shadowBake'
import { eastGrilleMount } from '../../scene/massing'
import { installMeshopt } from '../../scene/meshopt'
import type { QualityTier } from '../../types'

export { EAST_GRILLE_HI, EAST_GRILLE_INTENSITY, EAST_GRILLE_LO }

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

function bakeGrilleShadow(
  gl: { shadowMap: { autoUpdate: boolean; needsUpdate: boolean; enabled: boolean } },
  reason: string,
) {
  // 飞入推迟期间不烘。停稳且没有挂起的进层烘烤时再补，hi 切换和昼夜仍更新影子。
  if (!gl.shadowMap.enabled || !isCameraRested() || shadowBakePending()) return
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

export function EastGrille({ quality }: { quality: QualityTier }) {
  const mount = eastGrilleMount()
  return (
    <group name="EastGrille" position={mount.position} rotation={mount.rotation}>
      {quality === 'perf' ? <GrilleModel url={EAST_GRILLE_LO} /> : <BalancedGrille />}
    </group>
  )
}

export default EastGrille
