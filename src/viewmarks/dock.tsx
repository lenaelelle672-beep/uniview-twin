import { lazy, Suspense } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { mountAlarmTimeline } from '../components/AlarmTimelineGate'
import { ViewmarkDock } from './ViewmarkDock'

// T046：小地图跟这条晚加载入口走，不进首屏 hardGate / balancedFx。
void import('../minimap/mount')
// T051：问号监听跟同一条晚加载入口。面板本体仍等按下 ? 再拉。
void import('../shortcuts/arm')
// T054：告警提示音。整段逻辑在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../audio/AlarmAudioCue').then((mod) => {
  mod.mountAlarmAudioCue()
})
// T082：告警语音。整段逻辑在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../audio/AlarmSpeech').then((mod) => {
  mod.mountAlarmSpeech()
})
// T108：告警空间音。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../audio/mountPositional').then((mod) => {
  mod.mountPositionalAudio()
})
// T084：告警桌面通知。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../notify/AlarmNotify').then((mod) => {
  mod.mountAlarmNotify()
})
// T062：短视频录制。整段逻辑在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../capture/mountClip').then((mod) => {
  mod.mountClipCapture()
})
// T083：画中画值守。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../pip/mount').then((mod) => {
  mod.mountPipWatch()
})
// T059：网格和坐标轴。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../grid/mount').then((mod) => {
  mod.mountGridAxes()
})
// T065：墙面告警贴花。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../decals/mount').then((mod) => {
  mod.mountWallDecals()
})
// T072：Segments 批辅线。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../segments/mount').then((mod) => {
  mod.mountBatchSegments()
})
// T070：对焦装入。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../focus-fit/mount').then((mod) => {
  mod.mountFocusFit()
})
// T069：导览轨预览。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../tour-path/mount').then((mod) => {
  mod.mountTourPath()
})
// T066：灯光和相机辅助。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../author/helpers/mount').then((mod) => {
  mod.mountAuthorHelpers()
})
// T068：面光。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../author-lights/mount').then((mod) => {
  mod.mountRectAreaLights()
})
// T071：相机沿轨。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../tour-path/mount').then((mod) => {
  mod.mountMotionPath()
})
// T128：巡游体沿导览轨。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../tour-path/curveMount').then((mod) => {
  mod.mountCurvePatrol()
})
// T077：GLTF 片段浅拷。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../fragment-clone/mount').then((mod) => {
  mod.mountFragmentClones()
})
// T074：工位屏。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../screen-video/mount').then((mod) => {
  mod.mountScreenVideo()
})
// T075：悬停指针。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../cursor/mount').then((mod) => {
  mod.mountHoverCursor()
})
// T076：视锥暂停。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../frustum/mount').then((mod) => {
  mod.mountFrustumPause()
})
// T079：工位屏静态海报。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../screen-image/mount').then((mod) => {
  mod.mountScreenImage()
})
// T080：作者态拖摆。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../drag-placement/mount').then((mod) => {
  mod.mountPlacementDrag()
})
// T081：多标签总线。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../bus/mount').then((mod) => {
  mod.mountBroadcastBus(() => import('../components/scene/vp'))
})
// T085：大屏常亮。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../wake-lock/mount').then((mod) => {
  mod.mountScreenWakeLock()
})
// T086：密叠拾取轮询。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../cycle-raycast/mount').then((mod) => {
  mod.mountCycleRaycast()
})
// T087：文档画中画值守。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../document-watch/mount').then((mod) => {
  mod.mountDocumentWatch()
})
// T088：另存为。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../fs-access/mount').then((mod) => {
  mod.mountFileSave()
})
// T091：工位级爆炸。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../station-explode/mount').then((mod) => {
  mod.mountStationExplode()
})
// T094：爆炸进度滑杆和键盘档。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../explode-progress/mount').then((mod) => {
  mod.mountExplodeProgress()
})
// T103：SimReady 试吃。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../simready/mount').then((mod) => {
  mod.mountSimReady()
})
// T109：visualViewport 与 ResizeObserver。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../visual-viewport/mount').then((mod) => {
  mod.mountVisualViewportHud()
})
// T116：屏幕空间标注。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../screen-space/mount').then((mod) => {
  mod.mountScreenMark()
})
// T102：室内工位 Kenney CC0 桌椅。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../kenney-furniture/mount').then((mod) => {
  mod.mountKenneyFurniture()
})
// T105：楼层/视图的 DOM 过渡。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../view-transition/mount').then((mod) => {
  mod.mountFloorViewTransition()
})

const LayerPanel = lazy(() => import('./LayerPanel').then((mod) => ({ default: mod.LayerPanel })))

// T114：渐变天幕。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../gradient-sky/mount').then((mod) => {
  mod.mountGradientSky()
})
// T106：总览云层。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../overview-clouds/mount').then((mod) => {
  mod.mountOverviewClouds()
})
// T112：进层 setDrawRange 渐进显形。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../drawrange-reveal/mount').then((mod) => {
  mod.mountDrawRangeReveal()
})
// T115：拾取代理 MeshDiscardMaterial。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../discard-proxy/mount').then((mod) => {
  mod.mountDiscardProxy()
})
// T118：单层平面图俯视。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../floor-plan/mount').then((mod) => {
  mod.mountFloorPlan()
})

let root: Root | null = null
let host: HTMLElement | null = null
let mountMeasure: (() => void) | null = null

// T119：传感器/告警点云。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../sensor-points/mount').then((mod) => {
  mod.mountSensorPoints()
})

function mountMeasureSoon() {
  if (mountMeasure) {
    mountMeasure()
    return
  }
  void import('../measure/boot').then((mod) => {
    mountMeasure = mod.mountMeasure
    mountMeasure()
  })
}

function mount() {
  mountAlarmTimeline()
  mountMeasureSoon()
  if (host && !host.isConnected) {
    root?.unmount()
    root = null
    host = null
  }
  const next = document.querySelector<HTMLElement>('[data-vm]')
  if (!next || next === host) return
  host = next
  root?.unmount()
  root = createRoot(next)
  root.render(
    <div className="viewmark-row">
      <Suspense fallback={null}>
        <LayerPanel />
      </Suspense>
      <ViewmarkDock />
    </div>,
  )
}

mount()
const observer = new MutationObserver(mount)
observer.observe(document.body, { childList: true, subtree: true })

// T117：选中件 Resize 视口适配。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../resize-fit/mount').then((mod) => {
  mod.mountResizeFit()
})
// T120：家具/选中件径向投影阴影。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../radial-shadow/mount').then((mod) => {
  mod.mountRadialShadow()
})

// T121：楼壳着色 shaderMaterial。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../shell-shader/mount').then((mod) => {
  mod.mountShellShader()
})

// T122：圆角展台、设备基座和简易道具。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../rounded-box/mount').then((mod) => {
  mod.mountRoundedBox()
})

// T125：设备与告警的静态贝塞尔关系弧。整段在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../relation-arcs/mount').then((mod) => {
  mod.mountRelationArcs()
})
