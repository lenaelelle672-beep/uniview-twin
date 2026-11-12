import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Sampler } from '@react-three/drei/core/Sampler'
import type { Mesh } from 'three'
import {
  FLOOR_PLATE_POSITIONS,
  applySurfaceSamples,
  captureSurfaceSample,
  installSampleRandom,
  readSurfaceSample,
  restoreSampleRandom,
  surfaceSampleReady,
} from './sample'
import { SENSOR_CLOUD_COUNT, SENSOR_SAMPLE_COUNT } from './plan'

/** 采样板不参与拾取。点云自己的 raycast 也是空的。 */
function ignorePlatePick() {
  // 不往 intersects 里推。
}

/**
 * 构造 MeshSurfaceSampler 之前换上种子，采样 effect 结束后交还 Math.random。
 * 必须排在 Sampler 前面，layout effect 才会先跑。
 */
function SampleRandomSeed() {
  useLayoutEffect(() => {
    installSampleRandom()
    return restoreSampleRandom
  }, [])
  return null
}

function SampleRandomRestore() {
  useLayoutEffect(() => {
    restoreSampleRandom()
  }, [])
  return null
}

/**
 * T124：drei Sampler。网格先挂上，ref 有了才挂 Sampler，避免对空 mesh 采样。
 * 子 effect 写完采样后，这里把 XZ 铺进点云缓冲，再拆掉板和 Sampler。
 * 不留在场景里，也不每帧重采。
 */
export function SurfaceSample({
  positions,
  onSampled,
}: {
  positions: Float32Array
  onSampled: () => void
}) {
  const [live, setLive] = useState(() => !surfaceSampleReady())
  const meshRef = useRef<Mesh | null>(null)
  const [mesh, setMesh] = useState<Mesh | null>(null)
  const attach = useCallback((node: Mesh | null) => {
    if (!node) return
    meshRef.current = node
    setMesh((current) => current ?? node)
  }, [])
  useLayoutEffect(() => {
    if (!live || !surfaceSampleReady()) return
    applySurfaceSamples(positions, readSurfaceSample(), SENSOR_SAMPLE_COUNT, SENSOR_CLOUD_COUNT)
    onSampled()
    setLive(false)
  }, [live, mesh, positions, onSampled])
  if (!live) return null
  return (
    <>
      <mesh
        ref={attach}
        name="SensorSamplePlate"
        visible={false}
        frustumCulled={false}
        castShadow={false}
        receiveShadow={false}
        raycast={ignorePlatePick}
      >
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[FLOOR_PLATE_POSITIONS, 3]} />
        </bufferGeometry>
        <meshBasicMaterial />
      </mesh>
      {mesh ? (
        <>
          <SampleRandomSeed />
          <Sampler
            mesh={meshRef as RefObject<Mesh>}
            count={SENSOR_SAMPLE_COUNT}
            transform={captureSurfaceSample}
          />
          <SampleRandomRestore />
        </>
      ) : null}
    </>
  )
}
