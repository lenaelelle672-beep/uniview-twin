import { Canvas } from '@react-three/fiber'
import { Suspense, useLayoutEffect } from 'react'
import { FloorStage } from '../scene/stage/FloorStage'
import { B1 } from './scene/B1'
import { CameraRig } from './scene/CameraRig'
import { EastBlock } from './scene/EastBlock'
import { LocalEnvironment } from './scene/LocalEnvironment'
import { Podium } from './scene/Podium'
import { RenderProbe } from './scene/RenderProbe'
import { Site } from './scene/Site'
import { ExplodedLayout } from './scene/ExplodedLayout'
import { Tower } from './scene/Tower'
import { CAMERA_POSES } from '../scene/cameras'
import { applySurfaceMode, type SurfaceMode } from '../scene/materials'
import { qualityDprRange } from '../scene/quality'
import { useTwinStore } from '../store/store'

function SceneBody({ mode, quality }: { mode: SurfaceMode; quality: 'perf' | 'balanced' | 'high' }) {
  const model = mode === 'model'
  const night = mode === 'night'
  const background = model ? '#050505' : night ? '#07111c' : '#c5d7ea'
  const shadowSize = quality === 'high' ? 2048 : 1024
  const openBasement = useTwinStore((state) => state.view === 'floor' && state.selectedFloor === 'B1')

  return (
    <>
      <color attach="background" args={[background]} />
      <LocalEnvironment enabled={!model} />
      <hemisphereLight
        args={[
          model ? '#ffffff' : night ? '#243e68' : '#e7f1ff',
          model ? '#6e6e6e' : night ? '#0c0e12' : '#c8c2b4',
          model ? 0.5 : night ? 0.22 : 0.62,
        ]}
      />
      <ambientLight intensity={model ? 0.16 : night ? 0.05 : 0.14} />
      <directionalLight
        position={[78, 120, 46]}
        intensity={model ? 1.65 : night ? 0.32 : 1.4}
        color={night ? '#b7c6ea' : '#fff4e4'}
        castShadow={quality !== 'perf'}
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.035}
        shadow-camera-near={10}
        shadow-camera-far={720}
        shadow-camera-left={-220}
        shadow-camera-right={220}
        shadow-camera-top={220}
        shadow-camera-bottom={-220}
      />
      <CameraRig />
      <Suspense fallback={null}>
        <group name="AboveGradeContext" visible={!openBasement}>
          <Site model={model} night={night} quality={quality} />
          <Podium model={model} />
          <EastBlock model={model} />
          <B1 model={model} />
        </group>
        <Tower night={night} />
        <ExplodedLayout />
        <FloorStage />
        <RenderProbe />
      </Suspense>
    </>
  )
}

export function SceneCanvas() {
  const dayNight = useTwinStore((state) => state.dayNight)
  const quality = useTwinStore((state) => state.quality)
  const presentation = useTwinStore((state) => state.presentation)
  const mode: SurfaceMode = presentation === 'model' ? 'model' : dayNight === 'night' ? 'night' : 'day'
  const pose = CAMERA_POSES.overview
  applySurfaceMode(mode)

  useLayoutEffect(() => {
    applySurfaceMode(mode)
  }, [mode])

  return (
    <div className="scene-root" data-day-night={dayNight} data-presentation={presentation} data-quality={quality}>
      <Canvas
        key={quality}
        dpr={qualityDprRange(quality)}
        shadows={quality === 'perf' ? false : 'percentage'}
        camera={{ position: pose.position, fov: pose.fov, near: 0.45, far: 900 }}
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
      >
        <SceneBody mode={mode} quality={quality} />
      </Canvas>
    </div>
  )
}
