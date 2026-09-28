import { useEffect, useRef } from 'react'
import { useTwinStore } from '../store/store'

interface FloorListProps {
  open: boolean
}

export function FloorList({ open }: FloorListProps) {
  const floors = useTwinStore((state) => state.floors)
  const status = useTwinStore((state) => state.status)
  const selectedFloor = useTwinStore((state) => state.selectedFloor)
  const setSelectedFloor = useTwinStore((state) => state.setSelectedFloor)
  const setHoveredFloor = useTwinStore((state) => state.setHoveredFloor)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !selectedFloor || !listRef.current) return
    const target = listRef.current.querySelector<HTMLElement>(`[data-floor-id="${selectedFloor}"]`)
    target?.scrollIntoView({ block: 'nearest' })
  }, [open, selectedFloor, floors])

  return (
    <aside className={open ? 'floor-panel' : 'floor-panel is-collapsed'} aria-label="楼层列表" inert={!open}>
      <div className="panel-title">楼层</div>
      <div className="floor-items" ref={listRef}>
        {status === 'loading' && <p className="panel-hint">正在加载楼层…</p>}
        {status !== 'loading' && floors.length === 0 && <p className="panel-hint">暂无楼层数据</p>}
        {floors.map((floor) => {
          const selected = floor.id === selectedFloor
          return (
            <button
              key={floor.id}
              type="button"
              className={selected ? 'floor-item is-selected' : 'floor-item'}
              data-floor-id={floor.id}
              data-alarm={floor.alarmCount}
              data-offline={floor.offlineCount}
              aria-label={`${floor.id} ${floor.name}，告警 ${floor.alarmCount}，离线 ${floor.offlineCount}`}
              aria-pressed={selected}
              onClick={() => setSelectedFloor(floor.id)}
              onMouseEnter={() => setHoveredFloor(floor.id)}
              onMouseLeave={() => setHoveredFloor(null)}
              onFocus={() => setHoveredFloor(floor.id)}
              onBlur={() => setHoveredFloor(null)}
            >
              <span className="floor-id">{floor.id}</span>
              <span className="floor-name">{floor.name}</span>
              <span className="floor-counts">
                <span className="count-alarm">告警 {floor.alarmCount}</span>
                <span className="count-offline">离线 {floor.offlineCount}</span>
              </span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
