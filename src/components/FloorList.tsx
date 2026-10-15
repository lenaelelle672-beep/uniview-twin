import { useLayoutEffect, useMemo, useRef } from 'react'
import { loadFloorPlan } from '../floors/loadFloor'
import { overviewFloorRows, stripFloorRows, writeFloorMarkerProbe } from '../scene/floorMarkers'
import { useTwinStore } from '../store/store'

interface FloorListProps {
  open: boolean
}

export function FloorList({ open }: FloorListProps) {
  const floors = useTwinStore((state) => state.floors)
  const view = useTwinStore((state) => state.view)
  const selectedFloor = useTwinStore((state) => state.selectedFloor)
  const hoveredFloor = useTwinStore((state) => state.hoveredFloor)
  const setSelectedFloor = useTwinStore((state) => state.setSelectedFloor)
  const enterFloor = useTwinStore((state) => state.enterFloor)
  const emitFloorFly = useTwinStore((state) => state.emitFloorFly)
  const setHoveredFloor = useTwinStore((state) => state.setHoveredFloor)
  const listRef = useRef<HTMLDivElement>(null)
  const pendingSelect = useRef<ReturnType<typeof setTimeout> | null>(null)
  const strip = !open
  // 总览 compact / 单层全宽只改 overlay；宽由 .floor-rail 固定，进层不 setSize（D272/D273）。
  const compact = view === 'building' && open
  const rows = useMemo(() => overviewFloorRows(floors), [floors])
  const shown = strip ? stripFloorRows(rows) : rows

  useLayoutEffect(() => {
    writeFloorMarkerProbe(shown.length)
  }, [shown.length])

  useLayoutEffect(() => {
    return () => {
      if (pendingSelect.current != null) clearTimeout(pendingSelect.current)
    }
  }, [])

  useLayoutEffect(() => {
    if (!open || !selectedFloor || !listRef.current) return
    const target = listRef.current.querySelector<HTMLElement>(`[data-floor-id="${selectedFloor}"]`)
    target?.scrollIntoView({ block: 'nearest' })
  }, [open, selectedFloor, shown])

  const className = strip ? 'floor-panel is-strip' : compact ? 'floor-panel is-overview-compact' : 'floor-panel'

  return (
    <aside className={className} aria-label={strip ? '楼层窄条' : '楼层列表'}>
      {!strip && <div className="panel-title">楼层</div>}
      <div className="floor-items" ref={listRef}>
        {shown.map((floor) => {
          const selected = floor.id === selectedFloor
          const hovered = floor.id === hoveredFloor
          return (
            <button
              key={floor.id}
              type="button"
              className={`floor-item${selected ? ' is-selected' : ''}${hovered ? ' is-hovered' : ''}`}
              data-floor-id={floor.id}
              data-twin-floor-marker={floor.id}
              data-alarm={floor.alarmCount}
              data-offline={floor.offlineCount}
              aria-label={`${floor.id} ${floor.name}，告警 ${floor.alarmCount}，离线 ${floor.offlineCount}`}
              aria-pressed={selected}
              onClick={() => {
                // D253：单击只选中。双击的第一下先不画总览高亮，避免挡住进层。
                if (floor.id !== 'B1') void loadFloorPlan(floor.id)
                if (pendingSelect.current != null) clearTimeout(pendingSelect.current)
                pendingSelect.current = setTimeout(() => {
                  pendingSelect.current = null
                  setSelectedFloor(floor.id)
                }, 280)
              }}
              onDoubleClick={() => {
                if (pendingSelect.current != null) {
                  clearTimeout(pendingSelect.current)
                  pendingSelect.current = null
                }
                emitFloorFly(floor.id)
                enterFloor(floor.id)
                if (floor.id !== 'B1') void loadFloorPlan(floor.id)
              }}
              onMouseEnter={() => {
                setHoveredFloor(floor.id)
                if (floor.id !== 'B1') void loadFloorPlan(floor.id)
              }}
              onMouseLeave={() => setHoveredFloor(null)}
              onFocus={() => setHoveredFloor(floor.id)}
              onBlur={() => setHoveredFloor(null)}
            >
              <span className="floor-id">{floor.id}</span>
              {!compact && !strip && <span className="floor-name">{floor.name}</span>}
              <span className="floor-counts">
                {floor.alarmCount > 0 && <span className="count-alarm">{compact || strip ? floor.alarmCount : `告警 ${floor.alarmCount}`}</span>}
                {floor.offlineCount > 0 && (
                  <span className="count-offline">{compact || strip ? floor.offlineCount : `离线 ${floor.offlineCount}`}</span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
