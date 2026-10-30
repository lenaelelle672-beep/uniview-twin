import { Line } from '@react-three/drei/core/Line'
import { useStore } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { useTwinStore } from '../../store/store'
import type { Point } from './corridor'
import {
  WALK_DASH_SIZE,
  WALK_GAP_SIZE,
  WALK_PATH_BASE,
  WALK_PATH_BLENDING,
  WALK_PATH_DASHED,
  WALK_PATH_LIFT,
  WALK_PATH_OPACITY,
  WALK_PATH_ORDER,
  WALK_PATH_POLYGON_OFFSET,
  WALK_PATH_WIDTH,
  emptyWalkSamples,
  readPlanPaths,
  retainWalkColors,
  retainWalkPolylines,
  retainWalkSamples,
  selectWalkLayer,
  setWalkPathPref,
  subscribeWalkPathPref,
  walkPathPref,
  type WalkColorCache,
  type WalkGeometryCache,
  type WalkSampleCache,
} from './walkPaths'

function ignoreRaycast() {
  return null
}

/**
 * 进层后把 plan.walkPaths 画成贴地虚线。
 * drei Line 在 points / vertexColors 换引用时会 dispose LineMaterial 且不新建（D272）。
 * 这里保住两份引用；告警色真变了才换 key，让旧材质在卸载时释放，新线拿到新材质。
 */
function useWalkPathToggle(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return undefined
    const stage = document.querySelector('.stage')
    if (!stage) return undefined
    const bar = document.createElement('div')
    bar.dataset.walkPaths = 'on'
    bar.setAttribute('role', 'group')
    bar.setAttribute('aria-label', '走廊人流路径')
    bar.style.position = 'absolute'
    bar.style.zIndex = '4'
    bar.style.top = '12px'
    bar.style.left = '120px'
    bar.style.display = 'flex'
    bar.style.flexWrap = 'wrap'
    bar.style.gap = '4px'
    bar.style.maxWidth = 'calc(100% - 132px)'
    bar.style.padding = '4px'
    bar.style.borderRadius = '8px'
    bar.style.background = 'rgba(12, 35, 64, 0.9)'
    bar.style.color = '#f4f8fc'
    bar.style.pointerEvents = 'auto'
    const pathButton = document.createElement('button')
    const occupancyButton = document.createElement('button')
    for (const button of [pathButton, occupancyButton]) {
      button.type = 'button'
      button.style.border = '1px solid transparent'
      button.style.borderRadius = '6px'
      button.style.padding = '4px 8px'
      button.style.font = 'inherit'
      button.style.fontSize = '12px'
      button.style.lineHeight = '1.2'
      button.style.cursor = 'pointer'
    }
    pathButton.textContent = '路径'
    occupancyButton.textContent = '告警色'
    pathButton.setAttribute('aria-label', '显示走廊人流路径')
    occupancyButton.setAttribute('aria-label', '沿路径显示告警密度')
    const paintButton = (button: HTMLButtonElement, on: boolean) => {
      button.setAttribute('aria-pressed', on ? 'true' : 'false')
      button.style.background = on ? '#f4f8fc' : 'transparent'
      button.style.color = on ? '#0c2340' : '#f4f8fc'
    }
    const paint = () => {
      const current = walkPathPref()
      paintButton(pathButton, current.visible)
      paintButton(occupancyButton, current.occupancy)
    }
    pathButton.addEventListener('click', () => {
      setWalkPathPref({ visible: !walkPathPref().visible })
    })
    occupancyButton.addEventListener('click', () => {
      setWalkPathPref({ occupancy: !walkPathPref().occupancy })
    })
    bar.append(pathButton, occupancyButton)
    stage.append(bar)
    paint()
    const unsubscribe = subscribeWalkPathPref(paint)
    return () => {
      unsubscribe()
      bar.remove()
    }
  }, [enabled])
}

export function WalkPaths({ floorId, paths }: { floorId: string; paths?: readonly Point[][] }) {
  const liveAlarms = useTwinStore((state) => state.alarms)
  const playbackAlarms = useTwinStore((state) => state.alarmPlayback?.alarms)
  const devices = useTwinStore((state) => state.devices)
  const layer = useTwinStore(selectWalkLayer)
  const pref = useSyncExternalStore(subscribeWalkPathPref, walkPathPref, walkPathPref)
  const store = useStore()
  const alarms = playbackAlarms ?? liveAlarms
  const geoRef = useRef<WalkGeometryCache>({ key: '\0', floorId: '', paths: undefined, lines: [] })
  const sampleRef = useRef<WalkSampleCache>(emptyWalkSamples())
  const colorRef = useRef<WalkColorCache>({ key: '\0', samples: null, geometryKey: '', colors: null })
  const input = paths ?? readPlanPaths(floorId)
  const geometry = retainWalkPolylines(floorId, input, geoRef.current)
  geoRef.current = geometry
  const samples = retainWalkSamples(floorId, alarms, devices, sampleRef.current)
  sampleRef.current = samples
  const colors = retainWalkColors(geometry.lines, samples.points, pref.occupancy, geometry.key, colorRef.current)
  colorRef.current = colors
  const shown = geometry.lines.length > 0 && (layer === null ? pref.visible : layer)
  useWalkPathToggle(geometry.lines.length > 0 && layer === null)

  useLayoutEffect(() => {
    if (geometry.lines.length === 0) {
      delete window.__twinWalkPaths
    } else {
      window.__twinWalkPaths = {
        floorId,
        visible: shown,
        occupancy: pref.occupancy,
        dashed: WALK_PATH_DASHED,
        opacity: WALK_PATH_OPACITY,
        lift: WALK_PATH_LIFT,
        order: WALK_PATH_ORDER,
        lines: geometry.lines.length,
        points: geometry.lines,
        setVisible: (on) => setWalkPathPref({ visible: on }),
        setOccupancy: (on) => setWalkPathPref({ occupancy: on }),
      }
    }
    store.getState().invalidate()
    return () => {
      delete window.__twinWalkPaths
      store.getState().invalidate()
    }
  }, [colors, floorId, geometry, pref.occupancy, shown, store])

  if (!shown) return null
  return (
    <group name="WalkPaths" position={[0, WALK_PATH_LIFT, 0]} renderOrder={WALK_PATH_ORDER}>
      {geometry.lines.map((line, index) => {
        const vertexColors = colors.colors?.[index]
        return (
          <Line
            key={`${geometry.key}:${colors.key}:${index}`}
            name="WalkPath"
            points={line}
            color={vertexColors ? '#ffffff' : WALK_PATH_BASE}
            vertexColors={vertexColors}
            lineWidth={WALK_PATH_WIDTH}
            dashed={WALK_PATH_DASHED}
            dashSize={WALK_DASH_SIZE}
            gapSize={WALK_GAP_SIZE}
            transparent
            opacity={WALK_PATH_OPACITY}
            depthWrite={false}
            depthTest
            blending={WALK_PATH_BLENDING}
            polygonOffset
            polygonOffsetFactor={WALK_PATH_POLYGON_OFFSET}
            polygonOffsetUnits={WALK_PATH_POLYGON_OFFSET}
            frustumCulled={false}
            castShadow={false}
            receiveShadow={false}
            renderOrder={WALK_PATH_ORDER}
            raycast={ignoreRaycast}
          />
        )
      })}
    </group>
  )
}
