import { Detailed } from '@react-three/drei'
import { useLoader } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'
import { Mesh, MeshStandardMaterial } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { registerReflectiveEnvMaterial } from './LocalEnvironment'
import { eastGrilleMount } from '../../scene/massing'
import { installMeshopt } from '../../scene/meshopt'
import type { QualityTier } from '../../types'

export const EAST_GRILLE_INTENSITY = 1.85
export const EAST_GRILLE_HI = '/models/east-grille-v4-hi.glb'
export const EAST_GRILLE_LO = '/models/east-grille-v4-lo.glb'

function tuneEastGrille(root: Mesh['parent']) {
  if (!root) return
  root.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial)) continue
      if (material.name !== 'east_grille') continue
      material.envMapIntensity = EAST_GRILLE_INTENSITY
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

export function EastGrille({ quality }: { quality: QualityTier }) {
  const mount = eastGrilleMount()
  return (
    <group name="EastGrille" position={mount.position} rotation={mount.rotation}>
      {quality === 'perf' ? (
        <GrilleModel url={EAST_GRILLE_LO} />
      ) : (
        <Detailed distances={[0, 80]}>
          <GrilleModel url={EAST_GRILLE_HI} />
          <GrilleModel url={EAST_GRILLE_LO} />
        </Detailed>
      )}
    </group>
  )
}
