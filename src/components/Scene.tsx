import { Canvas, useThree } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import { useLayoutEffect } from 'react'
import { useTwinStore } from '../store/store'

function AimCamera() {
  const camera = useThree((state) => state.camera)
  useLayoutEffect(() => {
    camera.position.set(48, 32, 48)
    camera.lookAt(0, 4, 0)
    camera.updateProjectionMatrix()
  }, [camera])
  return null
}

function PlaceholderScene() {
  const dayNight = useTwinStore((state) => state.dayNight)
  const night = dayNight === 'night'
  return (
    <>
      <color attach="background" args={[night ? '#101826' : '#d7e6f2']} />
      <ambientLight intensity={night ? 0.18 : 0.72} />
      <directionalLight position={[40, 60, 24]} intensity={night ? 0.35 : 1.15} color={night ? '#9eb6e6' : '#fff4e5'} />
      <AimCamera />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[220, 220]} />
        <meshStandardMaterial color={night ? '#1a2433' : '#c5d4c2'} />
      </mesh>
      <Grid
        position={[0, 0.02, 0]}
        args={[200, 200]}
        cellSize={2}
        cellThickness={0.6}
        cellColor={night ? '#2a3a50' : '#b7c6b4'}
        sectionSize={10}
        sectionThickness={1.1}
        sectionColor={night ? '#3d5270' : '#8ea48b'}
        fadeDistance={160}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid={false}
      />
      <mesh position={[0, 6, 0]}>
        <boxGeometry args={[12, 12, 12]} />
        <meshStandardMaterial color={night ? '#4c93d6' : '#1f6aa5'} />
      </mesh>
    </>
  )
}

export function SceneCanvas() {
  const dayNight = useTwinStore((state) => state.dayNight)
  return (
    <div className="scene-root" data-day-night={dayNight}>
      <Canvas
        dpr={1}
        camera={{ position: [48, 32, 48], fov: 42, near: 0.1, far: 500 }}
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
      >
        <PlaceholderScene />
      </Canvas>
      <p className="scene-caption">占位场景：地面与楼体方块</p>
    </div>
  )
}
