import { useEffect, useRef } from 'react'
import { floorMarkerWorldPoints } from '../scene/floorMarkerAnchors'
import { useTwinStore } from '../store/store'

export function FloorLeader() {
  const view = useTwinStore((state) => state.view)
  const hoveredFloor = useTwinStore((state) => state.hoveredFloor)
  const selectedFloor = useTwinStore((state) => state.selectedFloor)
  const pathRef = useRef<SVGPathElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const floorId = view === 'building' ? hoveredFloor ?? selectedFloor : null

  useEffect(() => {
    if (view !== 'building') return
    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      const svg = svgRef.current
      const path = pathRef.current
      if (!svg || !path) return
      const stage = svg.parentElement
      if (!stage) return
      const id = useTwinStore.getState().hoveredFloor ?? useTwinStore.getState().selectedFloor
      if (!id || useTwinStore.getState().view !== 'building') {
        path.setAttribute('d', '')
        svg.dataset.active = ''
        return
      }
      const row = document.querySelector<HTMLElement>(`[data-twin-floor-marker="${id}"]`)
      const project = window.__twinProject
      if (!row || !project) {
        path.setAttribute('d', '')
        svg.dataset.active = ''
        return
      }
      const stageBox = stage.getBoundingClientRect()
      const rowBox = row.getBoundingClientRect()
      let best: { x: number; y: number } | null = null
      for (const [x, y, z] of floorMarkerWorldPoints(id)) {
        const projected = project(x, y, z)
        if (projected.behind) continue
        if (projected.x < stageBox.left || projected.x > stageBox.right) continue
        if (projected.y < stageBox.top || projected.y > stageBox.bottom) continue
        if (!best || projected.x < best.x) best = { x: projected.x, y: projected.y }
      }
      if (!best) {
        path.setAttribute('d', '')
        svg.dataset.active = ''
        return
      }
      const x1 = rowBox.right - stageBox.left
      const y1 = rowBox.top + rowBox.height / 2 - stageBox.top
      const x2 = best.x - stageBox.left
      const y2 = best.y - stageBox.top
      path.setAttribute('d', `M ${x1} ${y1} L ${x2} ${y2}`)
      svg.dataset.active = id
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [view])

  if (view !== 'building') return null
  return (
    <svg ref={svgRef} className="floor-leader" data-floor-leader={floorId ?? ''} aria-hidden="true">
      <path ref={pathRef} />
    </svg>
  )
}
