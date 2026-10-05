import { useFrame, useLoader } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { DoubleSide, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  EAST_GRILLE_HI,
  EAST_GRILLE_INTENSITY,
  EAST_GRILLE_LO,
  preloadEastGrilleHi,
} from '../../scene/eastGrilleAssets'
import { eastGrilleMount } from '../../scene/massing'
import { installMeshopt } from '../../scene/meshopt'
import type { QualityTier } from '../../types'
import { registerReflectiveEnvMaterial } from './LocalEnvironment'

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
      registerReflectiveEnvMaterial(material)
    }
  })
}

function GrilleModel({ url }: { url: string }) {
  const gltf = useLoader(GLTFLoader, url, installMeshopt)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf])
  useLayoutEffect(() => {
    tuneEastGrille(scene)
  }, [scene])
  return <primitive object={scene} />
}

const mountWorld = new Vector3()

type DetailedProps = { distances: number[]; children?: ReactNode }

function BalancedGrille() {
  const [near, setNear] = useState(false)
  const [hiReady, setHiReady] = useState(false)
  const [detailedPack, setDetailedPack] = useState<{ Detailed: ComponentType<DetailedProps> } | null>(null)
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
  useEffect(() => {
    if (!near || !hiReady || detailedPack) return
    let cancelled = false
    void import('@react-three/drei/core/Detailed').then((mod) => {
      if (!cancelled) setDetailedPack({ Detailed: mod.Detailed })
    })
    return () => {
      cancelled = true
    }
  }, [detailedPack, hiReady, near])
  if (!near || !hiReady || !detailedPack) return <GrilleModel url={EAST_GRILLE_LO} />
  const Detailed = detailedPack.Detailed
  return (
    <Detailed distances={[0, 80]}>
      <GrilleModel url={EAST_GRILLE_HI} />
      <GrilleModel url={EAST_GRILLE_LO} />
    </Detailed>
  )
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
