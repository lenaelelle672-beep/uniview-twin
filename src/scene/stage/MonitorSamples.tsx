import { useFrame, useThree } from '@react-three/fiber'
import { Color, Vector3 } from 'three'
import { floorSpec } from '../../data/floors'
import { facadeBandCorners, neighborFloorId, tightenNonOverlapping } from './facadeBoxes'
import { monitorPlateCorners } from './geometry'
import type { Slot } from './layout'
import { MONITOR_DISPLAY_COLOR } from './materials'
import { SLAB_M } from './cut'

const corner = new Vector3()

function projectCanvas(
  camera: { updateMatrixWorld: () => void; updateProjectionMatrix?: () => void },
  width: number,
  height: number,
  x: number,
  y: number,
  z: number,
) {
  camera.updateMatrixWorld()
  corner.set(x, y, z).project(camera as never)
  return {
    x: (corner.x * 0.5 + 0.5) * width,
    y: (-corner.y * 0.5 + 0.5) * height,
    behind: corner.z > 1 || corner.z < -1,
  }
}

function boxFromCorners(
  points: Array<{ x: number; y: number; behind: boolean }>,
  width: number,
  height: number,
) {
  if (points.length === 0 || points.some((point) => point.behind)) return null
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const point of points) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minY = Math.min(minY, point.y)
    maxY = Math.max(maxY, point.y)
  }
  const padX = (maxX - minX) * 0.08
  const padY = (maxY - minY) * 0.08
  let x = minX + padX
  let y = minY + padY
  let w = maxX - padX - x
  let h = maxY - padY - y
  const minW = 4
  const minH = 4
  if (w < minW) {
    x -= (minW - w) / 2
    w = minW
  }
  if (h < minH) {
    y -= (minH - h) / 2
    h = minH
  }
  x = Math.max(0, x)
  y = Math.max(0, y)
  w = Math.min(width - x, w)
  h = Math.min(height - y, h)
  if (w < 2 || h < 2) return null
  return { x, y, w, h }
}

function pickBox(
  candidates: Array<{ deskId: string; box: { x: number; y: number; w: number; h: number } }>,
  width: number,
  height: number,
) {
  // 楼板在画面中上部。靠下的投影会落到塔楼立面上，取样会变成深色玻璃。
  const inner = candidates.filter((item) => {
    const cx = item.box.x + item.box.w / 2
    const cy = item.box.y + item.box.h / 2
    return cx > width * 0.2 && cx < width * 0.8 && cy > height * 0.26 && cy < height * 0.5
  })
  const pool = inner.length > 0 ? inner : candidates
  return [...pool].sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h)[0] ?? null
}

export function MonitorSamples({
  floorId,
  slots,
  colors,
  deskIds,
}: {
  floorId: string
  slots: Slot[]
  colors: Color[]
  deskIds: string[]
}) {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)

  useFrame(() => {
    const width = gl.domElement.width
    const height = gl.domElement.height
    const elevation = floorSpec(floorId).elevation
    const alarm: Array<{ deskId: string; box: { x: number; y: number; w: number; h: number } }> = []
    const online: Array<{ deskId: string; box: { x: number; y: number; w: number; h: number } }> = []
    slots.forEach((slot, index) => {
      const deskId = deskIds[index]
      const color = colors[index]
      if (!deskId || !color) return
      const projected = monitorPlateCorners(slot, elevation, SLAB_M).map((point) =>
        projectCanvas(camera, width, height, point.x, point.y, point.z),
      )
      const box = boxFromCorners(projected, width, height)
      if (!box) return
      if (color.getHex() === MONITOR_DISPLAY_COLOR.alarm.getHex()) alarm.push({ deskId, box })
      if (color.getHex() === MONITOR_DISPLAY_COLOR.online.getHex()) online.push({ deskId, box })
    })
    window.__twinMonitorBoxes = {
      floorId,
      canvas: { width, height },
      alarm: pickBox(alarm, width, height),
      online: pickBox(online, width, height),
    }
  })

  return null
}

export function FacadeSamples() {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)

  useFrame(() => {
    const selected = window.__twinSelected
    const view = window.__twinView
    if (view !== 'building' || !selected || selected === 'B1' || !/^F\d+$/.test(selected)) {
      delete window.__twinFacadeBoxes
      return
    }
    const spec = floorSpec(selected)
    const neighborId = neighborFloorId(selected)
    const neighbor = floorSpec(neighborId)
    const width = gl.domElement.width
    const height = gl.domElement.height
    const selectedHits = facadeBandCorners(spec.elevation).map((point) =>
      projectCanvas(camera, width, height, point.x, point.y, point.z),
    )
    const neighborHits = facadeBandCorners(neighbor.elevation).map((point) =>
      projectCanvas(camera, width, height, point.x, point.y, point.z),
    )
    const selectedBox = boxFromCorners(selectedHits, width, height)
    const neighborBox = boxFromCorners(neighborHits, width, height)
    if (!selectedBox || !neighborBox) {
      delete window.__twinFacadeBoxes
      return
    }
    const packed = tightenNonOverlapping(selectedBox, neighborBox)
    window.__twinFacadeBoxes = {
      selectedFloor: selected,
      neighborFloor: neighborId,
      canvas: { width, height },
      selected: packed.selected,
      neighbor: packed.neighbor,
    }
  })

  return null
}
