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
// T062：短视频录制。整段逻辑在这条晚加载入口之后才 import，不进 hardGate / balancedFx。
void import('../capture/mountClip').then((mod) => {
  mod.mountClipCapture()
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

const LayerPanel = lazy(() => import('./LayerPanel').then((mod) => ({ default: mod.LayerPanel })))

let root: Root | null = null
let host: HTMLElement | null = null
let mountMeasure: (() => void) | null = null

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
