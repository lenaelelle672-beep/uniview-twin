import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Vector3 } from 'three'
import { COLUMN_SIZE_M, floorPlanGeometry, planDesks, type FloorPlanGeometry, type PlanRect } from '../blueprint/plan'
import { StatusMark } from '../blueprint/StatusMark'
import { isFloorId } from '../data/floors'
import { useTwinStore } from '../store/store'
import { flyToPlanPoint } from './fly'
import {
  MINIMAP_PROJECT_MS,
  createProjectionThrottle,
  minimapShows,
  planPointToWorld,
  polygonPoints,
  projectToPlan,
  viewConeOnPlane,
  type ViewCone,
} from './project'

const MARK_M = 0.62
const WALL_MIN_M = 0.42
const eyeScratch = new Vector3()
const targetScratch = new Vector3()

type RigWithEvents = NonNullable<Window['__twinRig']> & {
  addEventListener?: (type: string, fn: () => void) => void
  removeEventListener?: (type: string, fn: () => void) => void
}

interface ConeView {
  eyeX: number
  eyeZ: number
  targetX: number
  targetZ: number
  fov: number
  points: string
  eyePlotX: number
  eyePlotY: number
  farX: number
  farY: number
}

function thicken(wall: PlanRect): PlanRect {
  return {
    x: wall.x,
    z: wall.z,
    w: Math.max(wall.w, WALL_MIN_M),
    d: Math.max(wall.d, WALL_MIN_M),
  }
}

function clientToWorld(svg: SVGSVGElement, clientX: number, clientY: number, bounds: FloorPlanGeometry['bounds']) {
  const matrix = svg.getScreenCTM()
  if (!matrix) return null
  const point = svg.createSVGPoint()
  point.x = clientX
  point.y = clientY
  const local = point.matrixTransform(matrix.inverse())
  if (!Number.isFinite(local.x) || !Number.isFinite(local.y)) return null
  return planPointToWorld(local.x, local.y, bounds)
}

function coneViewOf(cone: ViewCone, eyeX: number, eyeZ: number, targetX: number, targetZ: number, fov: number): ConeView {
  const farX = (cone.polygon[1].x + cone.polygon[2].x) / 2
  const farY = (cone.polygon[1].y + cone.polygon[2].y) / 2
  return {
    eyeX,
    eyeZ,
    targetX,
    targetZ,
    fov,
    points: polygonPoints(cone.polygon),
    eyePlotX: cone.eye.x,
    eyePlotY: cone.eye.y,
    farX,
    farY,
  }
}

function sameCone(prev: ConeView | null, next: ConeView): boolean {
  if (!prev) return false
  return (
    Math.abs(prev.eyeX - next.eyeX) < 0.15 &&
    Math.abs(prev.eyeZ - next.eyeZ) < 0.15 &&
    Math.abs(prev.targetX - next.targetX) < 0.15 &&
    Math.abs(prev.targetZ - next.targetZ) < 0.15 &&
    Math.abs(prev.fov - next.fov) < 0.5
  )
}

export function FloorMinimap() {
  const view = useTwinStore((state) => state.view)
  const selectedFloor = useTwinStore((state) => state.selectedFloor)
  const desks = useTwinStore((state) => state.desks)
  const devices = useTwinStore((state) => state.devices)
  const focusedDeskId = useTwinStore((state) => state.focusedDeskId)
  const show = minimapShows(view, selectedFloor)
  const floorId = show ? selectedFloor : null
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [cone, setCone] = useState<ConeView | null>(null)
  const heading = useRef({ x: 0, z: 1 })

  useLayoutEffect(() => {
    const node = document.querySelector<HTMLElement>('[data-minimap-host]')
    if (!node) return
    node.hidden = !show
  }, [show])

  useEffect(() => {
    if (!floorId || !isFloorId(floorId)) return
    setCone(null)
    if (floorId === 'B1') {
      setReady(true)
      setFailed(false)
      return
    }
    let cancelled = false
    setReady(false)
    setFailed(false)
    void import('../floors/loadFloor')
      .then((mod) => mod.loadFloorPlan(floorId))
      .then(() => {
        if (!cancelled) setReady(true)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [floorId])

  const geometry = useMemo(() => {
    if (!ready || !floorId) return null
    return floorPlanGeometry(floorId)
  }, [floorId, ready])

  const marks = useMemo(() => {
    if (!ready || !floorId) return []
    return planDesks(floorId, desks, devices)
  }, [desks, devices, floorId, ready])

  useEffect(() => {
    if (!show || !floorId || !geometry) {
      delete window.__twinMinimap
      return
    }
    const bounds = geometry.bounds
    const throttle = createProjectionThrottle(
      MINIMAP_PROJECT_MS,
      () => performance.now(),
      (fn, ms) => window.setTimeout(fn, ms),
      (id) => window.clearTimeout(id),
    )
    let attached: RigWithEvents | null = null

    const sample = () => {
      const rig = window.__twinRig
      if (!rig) return
      const eye = eyeScratch
      const target = targetScratch
      rig.getPosition(eye, false)
      rig.getTarget(target, false)
      const fov = rig.camera?.fov ?? 48
      const canvas = document.querySelector('canvas')
      const aspect = canvas && canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 16 / 9
      const nextCone = viewConeOnPlane({
        eyeX: eye.x,
        eyeZ: eye.z,
        targetX: target.x,
        targetZ: target.z,
        fovDeg: fov,
        aspect,
        bounds,
        headingX: heading.current.x,
        headingZ: heading.current.z,
      })
      heading.current.x = nextCone.headingX
      heading.current.z = nextCone.headingZ
      window.__twinMinimap = {
        floorId,
        eyeX: eye.x,
        eyeZ: eye.z,
        targetX: target.x,
        targetZ: target.z,
        headingX: nextCone.headingX,
        headingZ: nextCone.headingZ,
      }
      const next = coneViewOf(nextCone, eye.x, eye.z, target.x, target.z, fov)
      setCone((prev) => (sameCone(prev, next) ? prev : next))
    }

    const onMove = () => throttle.push(sample)
    const attach = (rig: RigWithEvents) => {
      attached = rig
      rig.addEventListener?.('update', onMove)
      rig.addEventListener?.('control', onMove)
    }
    const detach = () => {
      attached?.removeEventListener?.('update', onMove)
      attached?.removeEventListener?.('control', onMove)
      attached = null
    }

    sample()
    if (window.__twinRig) attach(window.__twinRig)
    const watch = window.setInterval(() => {
      const live = window.__twinRig as RigWithEvents | undefined
      if (live && live !== attached) {
        detach()
        attach(live)
        sample()
      }
    }, 400)

    return () => {
      throttle.cancel()
      detach()
      window.clearInterval(watch)
      delete window.__twinMinimap
    }
  }, [floorId, geometry, show])

  if (!show || !floorId) return null

  const title = `${floorId} 小地图`

  return (
    <aside className="minimap" data-minimap-root data-minimap-floor={floorId} aria-label="楼层小地图">
      <p className="minimap-title">{title}</p>
      {failed && <p className="minimap-note">图纸没有加载</p>}
      {!failed && !geometry && <p className="minimap-note">正在加载图纸…</p>}
      {geometry && (
        <svg
          viewBox={`0 0 ${geometry.bounds.width} ${geometry.bounds.depth}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`${title}，点击后飞到对应位置`}
          onClick={(event) => {
            const world = clientToWorld(event.currentTarget, event.clientX, event.clientY, geometry.bounds)
            if (!world) return
            flyToPlanPoint(world.x, world.z)
          }}
        >
          <PlanPlate geometry={geometry} />
          {geometry.atrium && <AtriumMark geometry={geometry} />}
          {geometry.fan && (
            <polygon
              points={geometry.fan
                .map(([x, z]) => {
                  const plot = projectToPlan(x, z, geometry.bounds)
                  return `${plot.x},${plot.y}`
                })
                .join(' ')}
              className="minimap-fan"
            />
          )}
          {geometry.rooms.map((room, index) => {
            const origin = projectToPlan(room.x0, room.z0, geometry.bounds)
            return (
              <rect
                key={`${room.name}-${index}`}
                x={origin.x}
                y={origin.y}
                width={room.x1 - room.x0}
                height={room.z1 - room.z0}
                className="minimap-room"
              />
            )
          })}
          {geometry.walls.map((wall, index) => {
            const box = thicken(wall)
            const origin = projectToPlan(box.x - box.w / 2, box.z - box.d / 2, geometry.bounds)
            return (
              <rect key={`wall-${index}`} x={origin.x} y={origin.y} width={box.w} height={box.d} className="minimap-wall" />
            )
          })}
          {geometry.columns.map((column) => {
            const origin = projectToPlan(column.x, column.z, geometry.bounds)
            return (
              <rect
                key={`column-${column.x}-${column.z}`}
                x={origin.x - COLUMN_SIZE_M / 2}
                y={origin.y - COLUMN_SIZE_M / 2}
                width={COLUMN_SIZE_M}
                height={COLUMN_SIZE_M}
                className="minimap-column"
              />
            )
          })}
          {marks.map((mark) => {
            const plot = projectToPlan(mark.x, mark.z, geometry.bounds)
            return (
              <g key={mark.id} className="minimap-desk" data-desk-id={mark.id}>
                <StatusMark status={mark.status} cx={plot.x} cy={plot.y} size={MARK_M} selected={mark.id === focusedDeskId} />
              </g>
            )
          })}
          {cone && (
            <g data-minimap-cone>
              <polygon points={cone.points} className="minimap-cone" />
              <line x1={cone.eyePlotX} y1={cone.eyePlotY} x2={cone.farX} y2={cone.farY} className="minimap-look" />
              <circle cx={cone.eyePlotX} cy={cone.eyePlotY} r={0.72} className="minimap-eye" />
            </g>
          )}
        </svg>
      )}
    </aside>
  )
}

function AtriumMark({ geometry }: { geometry: FloorPlanGeometry }) {
  const atrium = geometry.atrium
  if (!atrium) return null
  const plot = projectToPlan(atrium.cx, atrium.cz, geometry.bounds)
  return <ellipse cx={plot.x} cy={plot.y} rx={atrium.rx} ry={atrium.rz} className="minimap-atrium" />
}

function PlanPlate({ geometry }: { geometry: FloorPlanGeometry }) {
  const { bounds } = geometry
  if (geometry.slab) {
    return (
      <polygon
        points={geometry.slab.map(([x, z]) => {
          const plot = projectToPlan(x, z, bounds)
          return `${plot.x},${plot.y}`
        }).join(' ')}
        className="minimap-plate"
      />
    )
  }
  const origin = projectToPlan(geometry.outline.x0, geometry.outline.z0, bounds)
  return (
    <rect
      x={origin.x}
      y={origin.y}
      width={geometry.outline.x1 - geometry.outline.x0}
      height={geometry.outline.z1 - geometry.outline.z0}
      className="minimap-plate"
    />
  )
}
