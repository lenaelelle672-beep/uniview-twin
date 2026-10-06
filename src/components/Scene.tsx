import { Hud } from '@react-three/drei/core/Hud'
import { Canvas, useThree } from '@react-three/fiber'
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AgXToneMapping, Group } from 'three'
import { FloorStage } from '../scene/stage/FloorStage'
import { B1 } from './scene/B1'
import { CameraRig, FitBump } from './scene/CameraRig'
import { EastBlock } from './scene/EastBlock'
import { FloorBadges } from './scene/FloorBadges'
import { LocalEnvironment } from './scene/LocalEnvironment'
import { Podium } from './scene/Podium'
import { MainScenePass, MonitorPass } from './scene/MonitorPass'
import { RenderProbe } from './scene/RenderProbe'
import { ParcelMesh, Site } from './scene/Site'
import { ExplodedLayout } from './scene/ExplodedLayout'
import { Tower } from './scene/Tower'
import { useBalancedWarmup } from './scene/useBalancedWarmup'
import { CAMERA_POSES } from '../scene/cameras'
import { applySurfaceMode, type SurfaceMode } from '../scene/materials'
import { gpuTierLabel, preserveDrawingBufferFor, probeSoftwareGpu } from '../scene/gpuDetect'
import { qualityDprRange } from '../scene/quality'
import { EnablePickVolumeRaycast } from '../scene/pickLayers'
import { useTwinStore } from '../store/store'

const ContactGround = lazy(() => import('./scene/postfx/balancedFx').then((mod) => ({ default: mod.ContactGround })))
const PostFX = lazy(() => import('./scene/postfx/balancedFx').then((mod) => ({ default: mod.PostFX })))
const FacadeSamples = lazy(() =>
  import('../scene/stage/MonitorSamples').then((mod) => ({ default: mod.FacadeSamples })),
)
const DemandLoop = lazy(() => import('./scene/DemandLoop'))

function DayExposure({ mode }: { mode: SurfaceMode }) {
  const gl = useThree((state) => state.gl)
  useLayoutEffect(() => {
    // AgX 中灰比 ACES 更沉，白天抬曝光，单层和 B1 才不会整层变暗。夜间和白模保持 1。
    gl.toneMappingExposure = mode === 'day' ? 2 : 1
  }, [gl, mode])
  return null
}

function SceneBody({ mode }: { mode: SurfaceMode }) {
  const quality = useTwinStore((state) => state.quality)
  const model = mode === 'model'
  const night = mode === 'night'
  const background = model ? '#000000' : night ? '#07111c' : '#c5d7ea'
  const shadowSize = quality === 'high' ? 2048 : 1024
  const [composerLive, setComposerLive] = useState(false)
  const [keepFx, setKeepFx] = useState(false)
  const [prefetchDone, setPrefetchDone] = useState(false)
  const extrasReady = useBalancedWarmup(quality, composerLive)
  const [loopOn, setLoopOn] = useState(false)
  const view = useTwinStore((state) => state.view)
  const selectedFloor = useTwinStore((state) => state.selectedFloor)
  const openBasement = view === 'floor' && selectedFloor === 'B1'
  const fitRef = useRef<Group>(null)
  const [fitGeneration, setFitGeneration] = useState(0)
  const bumpFit = useCallback(() => setFitGeneration((value) => value + 1), [])

  useLayoutEffect(() => {
    if (quality === 'perf') {
      setComposerLive(false)
      window.__twinComposerLive = false
    }
  }, [quality])

  useLayoutEffect(() => {
    if (extrasReady) setKeepFx(true)
  }, [extrasReady])

  useEffect(() => {
    let cancelled = false
    const prefetchChunkStarted = () => {
      const entries = performance.getEntriesByType('resource')
      return ['floorDecor', 'textRuntime', 'BlueprintView'].every((name) =>
        entries.some((entry) => entry.name.includes(name)),
      )
    }
    const tick = () => {
      if (cancelled) return
      if (window.__twinFirstFrameAt != null) setLoopOn(true)
      // __twinPrefetchAt 在 import() 之前就写入，不能当“预取已发出”。
      // 等三个预取包都进 Resource Timing，再隔一帧才挂 FacadeSamples，
      // 避免 MonitorSamples 和预取抢同一拍、夹到首帧和预取之间。
      if (window.__twinPrefetchAt != null && prefetchChunkStarted()) {
        requestAnimationFrame(() => {
          if (!cancelled) setPrefetchDone(true)
        })
        return
      }
      if (window.__twinFirstFrameAt != null && useTwinStore.getState().view !== 'building') return
      requestAnimationFrame(tick)
    }
    tick()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      {loopOn && (
        <Suspense fallback={null}>
          <DemandLoop />
        </Suspense>
      )}
      <color attach="background" args={[background]} />
      <EnablePickVolumeRaycast />
      <DayExposure mode={mode} />
      <LocalEnvironment enabled={!model} night={night} />
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
      <CameraRig fitRef={fitRef} fitGeneration={fitGeneration} />
      {/* D124 / D126：EastGrille 与 RenderProbe 同边界；__twinReady 等格栅 chunk+lo GLB，以及 Suspense 外 HDR 解码和 PMREM。 */}
      <Suspense fallback={null}>
        <group ref={fitRef} name="Buildings">
          <Tower night={night} />
          <group name="AboveGradeContext" visible={!openBasement}>
            {!model && <ParcelMesh />}
            <Podium model={model} />
            <EastBlock model={model} quality={quality} />
            <B1 model={model} />
          </group>
          <FitBump onReady={bumpFit} />
        </group>
        <group visible={!openBasement}>
          <Site model={model} night={night} quality={quality} />
        </group>
        {keepFx && (
          <Suspense fallback={null}>
            <ContactGround active={quality !== 'perf'} />
          </Suspense>
        )}
        <ExplodedLayout />
        <FloorStage />
        <RenderProbe />
      </Suspense>
      {/* 合成器首帧出来之前继续由 MainScenePass 画主场景，避免只剩徽标。 */}
      {!composerLive && <MainScenePass renderPriority={1} />}
      <MonitorPass renderPriority={2} drawOverlay={!composerLive} />
      {view === 'building' && (
        <Suspense fallback={null}>
          <Hud renderPriority={3}>
            <FloorBadges />
          </Hud>
        </Suspense>
      )}
      {prefetchDone && (
        <Suspense fallback={null}>
          <FacadeSamples />
        </Suspense>
      )}
      {keepFx && (
        <Suspense fallback={null}>
          <PostFX active={quality !== 'perf'} onLive={() => setComposerLive(true)} />
        </Suspense>
      )}
    </>
  )
}

export function SceneCanvas() {
  const dayNight = useTwinStore((state) => state.dayNight)
  const quality = useTwinStore((state) => state.quality)
  const qualityPinned = useTwinStore((state) => state.qualityPinned)
  const presentation = useTwinStore((state) => state.presentation)
  const cam = useTwinStore((state) => state.cam)
  const setSelectedFloor = useTwinStore((state) => state.setSelectedFloor)
  const [gpuReady, setGpuReady] = useState(false)
  const probe = probeSoftwareGpu()
  const softwareAuto = probe.software && !qualityPinned
  const keepBuffer = preserveDrawingBufferFor(probe.software)
  const mode: SurfaceMode = presentation === 'model' ? 'model' : dayNight === 'night' ? 'night' : 'day'
  const pose = cam ? CAMERA_POSES[cam] : CAMERA_POSES.overview
  applySurfaceMode(mode)

  useLayoutEffect(() => {
    applySurfaceMode(mode)
  }, [mode])

  return (
    <div className="scene-root" data-day-night={dayNight} data-presentation={presentation} data-quality={quality}>
      {/* 不按性能档重建画布。换档会新建 WebGLRenderer，three 按渲染器缓存的 PMREM 会再生成一次。dpr 和阴影在同一个画布上更新。 */}
      <Canvas
        frameloop="demand"
        dpr={qualityDprRange(quality, softwareAuto)}
        shadows={gpuReady && quality !== 'perf' ? 'percentage' : false}
        camera={{ position: pose.position, fov: pose.fov, near: 0.35, far: 2400 }}
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: keepBuffer, toneMapping: AgXToneMapping }}
        onCreated={({ gl }) => {
          const q = useTwinStore.getState().quality
          window.__twinGpu = {
            renderer: probe.renderer,
            software: probe.software,
            tier: gpuTierLabel(q),
            softwareAuto,
            preserveDrawingBuffer: keepBuffer,
            dpr: softwareAuto ? 0.75 : undefined,
            probeMs: probe.probeMs,
          }
          gl.shadowMap.autoUpdate = false
          setGpuReady(true)
        }}
        onPointerMissed={() => {
          setSelectedFloor(null)
        }}
      >
        {gpuReady ? <SceneBody mode={mode} /> : null}
      </Canvas>
    </div>
  )
}
