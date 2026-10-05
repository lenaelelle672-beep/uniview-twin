import { useLoader } from '@react-three/fiber'
import { useLayoutEffect, useMemo } from 'react'
import { Mesh, MeshStandardMaterial } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { propNightEmissive } from '../../scene/props/emissive'
import { installMeshopt } from '../../scene/meshopt'

const SIGN = '/models/roof-sign.glb'

useLoader.preload(GLTFLoader, SIGN, installMeshopt)

export function RoofSign({ night, position }: { night: boolean; position: [number, number, number] }) {
  const gltf = useLoader(GLTFLoader, SIGN, installMeshopt)
  const sign = useMemo(() => gltf.scene.clone(true), [gltf])
  useLayoutEffect(() => {
    sign.traverse((child) => {
      const mesh = child as Mesh
      if (!mesh.isMesh) return
      const material = mesh.material as MeshStandardMaterial
      const tune = propNightEmissive(material.name, night)
      material.emissive.set(tune.color)
      material.emissiveIntensity = tune.intensity
    })
  }, [night, sign])
  return <primitive object={sign} position={position} />
}
