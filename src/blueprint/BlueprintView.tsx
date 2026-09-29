import { useState } from 'react'
import { floorSpec, isFloorId } from '../data/floors'
import { statusLabel } from '../alarms/labels'
import { DEVICE_STATUSES } from '../types'
import { STATUS_SHAPE } from '../scene/stage/status'
import { useTwinStore } from '../store/store'
import { COLUMN_SIZE_M, floorPlanGeometry, planDesks, type PlanBounds } from './plan'
import { StatusMark } from './StatusMark'

const MARK_M = 0.46
const ZOOM_MIN = 1
const ZOOM_MAX = 4

function worldX(x: number, bounds: PlanBounds) {
  return x - bounds.minX
}

function worldY(z: number, bounds: PlanBounds) {
  return z - bounds.minZ
}

export function BlueprintView() {
  const selectedFloor = useTwinStore((state) => state.selectedFloor)
  const focusedDeskId = useTwinStore((state) => state.focusedDeskId)
  const desks = useTwinStore((state) => state.desks)
  const devices = useTwinStore((state) => state.devices)
  const floors = useTwinStore((state) => state.floors)
  const selectDesk = useTwinStore((state) => state.selectDesk)
  const [zoom, setZoom] = useState(1)

  if (!selectedFloor || !isFloorId(selectedFloor)) {
    return (
      <div className="blueprint" role="region" aria-label="蓝图视图">
        <p className="blueprint-empty">请在左侧选择楼层。</p>
      </div>
    )
  }

  const spec = floorSpec(selectedFloor)
  const floor = floors.find((item) => item.id === selectedFloor)
  const geometry = floorPlanGeometry(selectedFloor)
  const marks = planDesks(selectedFloor, desks, devices)
  const { bounds } = geometry
  const counts = { online: 0, idle: 0, alarm: 0, offline: 0 }
  for (const mark of marks) counts[mark.status] += 1
  const title = floor ? `${floor.id} · ${floor.name}` : `${spec.id} · ${spec.name}`

  return (
    <div className="blueprint" role="region" aria-label="蓝图视图" data-blueprint-floor={selectedFloor}>
      <div className="blueprint-toolbar">
        <p>
          {title}
          <span className="blueprint-count">工位 {marks.length}</span>
        </p>
        <div className="blueprint-zoom" role="group" aria-label="蓝图缩放">
          <button type="button" aria-label="缩小蓝图" disabled={zoom <= ZOOM_MIN} onClick={() => setZoom((value) => clampZoom(value / 1.25))}>
            缩小
          </button>
          <button type="button" aria-label="放大蓝图" disabled={zoom >= ZOOM_MAX} onClick={() => setZoom((value) => clampZoom(value * 1.25))}>
            放大
          </button>
          <button type="button" aria-label="蓝图适应窗口" onClick={() => setZoom(1)}>
            适应
          </button>
        </div>
      </div>
      <div className={zoom > 1 ? 'blueprint-scroll is-zoomed' : 'blueprint-scroll'} style={{ ['--zoom' as string]: String(zoom) }}>
        <svg
          viewBox={`0 0 ${bounds.width} ${bounds.depth}`}
          role="img"
          aria-label={`${title} 平面蓝图，${marks.length} 个工位`}
          data-desk-count={marks.length}
          data-status-online={counts.online}
          data-status-idle={counts.idle}
          data-status-alarm={counts.alarm}
          data-status-offline={counts.offline}
        >
          <rect
            x={worldX(geometry.outline.x0, bounds)}
            y={worldY(geometry.outline.z0, bounds)}
            width={geometry.outline.x1 - geometry.outline.x0}
            height={geometry.outline.z1 - geometry.outline.z0}
            className="plan-plate"
          />
          {geometry.atrium && (
            <ellipse
              cx={worldX(geometry.atrium.cx, bounds)}
              cy={worldY(geometry.atrium.cz, bounds)}
              rx={geometry.atrium.rx}
              ry={geometry.atrium.rz}
              className="plan-atrium"
            />
          )}
          {geometry.fan && (
            <polygon
              points={geometry.fan.map(([x, z]) => `${worldX(x, bounds)},${worldY(z, bounds)}`).join(' ')}
              className="plan-fan"
            />
          )}
          {geometry.rooms.map((room) => {
            const x = worldX(room.x0, bounds)
            const y = worldY(room.z0, bounds)
            const width = room.x1 - room.x0
            const height = room.z1 - room.z0
            const fontSize = Math.min(1.35, width * 0.22, height * 0.42)
            return (
              <g key={room.name}>
                <rect x={x} y={y} width={width} height={height} className="plan-room" />
                <text x={x + width / 2} y={y + height / 2} className="plan-label" fontSize={fontSize}>
                  {room.name}
                </text>
              </g>
            )
          })}
          {geometry.walls.map((wall, index) => (
            <rect
              key={`wall-${index}`}
              x={worldX(wall.x - wall.w / 2, bounds)}
              y={worldY(wall.z - wall.d / 2, bounds)}
              width={wall.w}
              height={wall.d}
              className="plan-wall"
            />
          ))}
          {geometry.columns.map((column) => (
            <rect
              key={`column-${column.x}-${column.z}`}
              x={worldX(column.x, bounds) - COLUMN_SIZE_M / 2}
              y={worldY(column.z, bounds) - COLUMN_SIZE_M / 2}
              width={COLUMN_SIZE_M}
              height={COLUMN_SIZE_M}
              className="plan-column"
            />
          ))}
          {marks.map((mark) => {
            const selected = mark.id === focusedDeskId
            return (
              <g
                key={mark.id}
                role="button"
                tabIndex={0}
                className="plan-desk"
                data-desk-id={mark.id}
                data-status={mark.status}
                data-shape={STATUS_SHAPE[mark.status]}
                aria-label={`${mark.id} ${statusLabel(mark.status)}`}
                aria-pressed={selected}
                onClick={() => selectDesk(mark.id)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  selectDesk(mark.id)
                }}
              >
                <circle className="plan-hit" cx={worldX(mark.x, bounds)} cy={worldY(mark.z, bounds)} r={0.68} />
                <StatusMark status={mark.status} cx={worldX(mark.x, bounds)} cy={worldY(mark.z, bounds)} size={MARK_M} selected={selected} />
              </g>
            )
          })}
        </svg>
      </div>
      <ul className="blueprint-legend" aria-label="工位状态图例">
        {DEVICE_STATUSES.map((status) => (
          <li key={status} data-legend={status}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <StatusMark status={status} cx={8} cy={8} size={4} />
            </svg>
            <span>
              {statusLabel(status)} {counts[status]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function clampZoom(value: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 1000) / 1000))
}
