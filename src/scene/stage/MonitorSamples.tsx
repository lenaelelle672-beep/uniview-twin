import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { Color, Vector3 } from 'three'
import { floorSpec } from '../../data/floors'
import { facadeGlassCorners, neighborFloorId, tightenNonOverlapping } from './facadeBoxes'
import {
  MONITOR_SCREEN_PATCHES,
  monitorPlateCorners,
  monitorScreenCorners,
  monitorScreenPatchCorners,
} from './geometry'
import type { Slot } from './layout'
import { MONITOR_DISPLAY_COLOR } from './materials'
import { SLAB_M } from './cut'

const corner = new Vector3()

function projectCanvas(
  camera: { updateMatrixWorld: () => void; updateProjectionMatrix?: () => void; matrixWorld?: { elements: ArrayLike<number> } },
  width: number,
  height: number,
  x: number,
  y: number,
  z: number,
) {
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
  inset = 0.12,
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
  const rawW = maxX - minX
  const rawH = maxY - minY
  if (rawW < 2 || rawH < 2) return null
  const padX = rawW >= 4 ? Math.min((rawW - 4) / 2, rawW * inset) : 0
  const padY = rawH >= 4 ? Math.min((rawH - 4) / 2, rawH * inset) : 0
  let x = minX + padX
  let y = minY + padY
  let w = maxX - padX - x
  let h = maxY - padY - y
  if (w < 4) {
    x -= (4 - w) / 2
    w = 4
  }
  if (h < 4) {
    y -= (4 - h) / 2
    h = 4
  }
  x = Math.max(0, Math.min(width - 4, x))
  y = Math.max(0, Math.min(height - 4, y))
  w = Math.min(width - x, w)
  h = Math.min(height - y, h)
  if (w < 4 || h < 4) return null
  return { x, y, w, h }
}

function onCanvas(box: { x: number; y: number; w: number; h: number }, width: number, height: number) {
  return box.x > 4 && box.y > 4 && box.x + box.w < width - 4 && box.y + box.h < height - 4
}

function pickDesk(
  candidates: Array<{
    deskId: string
    box: { x: number; y: number; w: number; h: number }
    patches: Array<{ name: string; box: { x: number; y: number; w: number; h: number } }>
  }>,
  width: number,
  height: number,
) {
  const visible = candidates.filter((item) => onCanvas(item.box, width, height))
  const inner = visible.filter((item) => {
    const cx = item.box.x + item.box.w / 2
    const cy = item.box.y + item.box.h / 2
    return cx > width * 0.18 && cx < width * 0.82 && cy > height * 0.22 && cy < height * 0.62
  })
  const pool = inner.length > 0 ? inner : visible.length > 0 ? visible : candidates
  return (
    [...pool].sort((a, b) => {
      const patchScore = b.patches.length - a.patches.length
      if (patchScore !== 0) return patchScore
      return b.box.w * b.box.h - a.box.w * a.box.h
    })[0] ?? null
  )
}

export function MonitorSamples({
  floorId,
  slots,
  colors,
  deskIds,
}: {
  floorId: string
  elevation?: number
  slots: Slot[]
  colors: Color[]
  deskIds: string[]
}) {
  const camera = useThree((state) => state.camera)
  const gl = useThree((state) => state.gl)
  const posed = useRef({
    floorId: '',
    x: Number.NaN,
    y: Number.NaN,
    z: Number.NaN,
    fx: Number.NaN,
    fy: Number.NaN,
    fz: Number.NaN,
    w: 0,
    h: 0,
    sawFlight: false,
  })

  useFrame(() => {
    const pose = posed.current
    if (pose.floorId !== floorId) {
      pose.floorId = floorId
      pose.x = Number.NaN
      if (window.__twinMonitorBoxes) delete window.__twinMonitorBoxes
    }
    // 飞入帧已经在画整层。315 个工位的屏上盒留到停稳后的下一帧，避免和那次绘制叠在同一帧。
    if (window.__twinView === 'floor' && window.__twinCameraRested !== true) {
      pose.sawFlight = true
      return
    }
    if (pose.sawFlight) {
      pose.sawFlight = false
      return
    }
    camera.updateMatrixWorld()
    const width = gl.domElement.width
    const height = gl.domElement.height
    const elements = camera.matrixWorld.elements
    const still =
      pose.floorId === floorId &&
      pose.w === width &&
      pose.h === height &&
      Math.abs(elements[12]! - pose.x) < 5e-4 &&
      Math.abs(elements[13]! - pose.y) < 5e-4 &&
      Math.abs(elements[14]! - pose.z) < 5e-4 &&
      Math.abs(elements[8]! - pose.fx) < 5e-4 &&
      Math.abs(elements[9]! - pose.fy) < 5e-4 &&
      Math.abs(elements[10]! - pose.fz) < 5e-4
    if (still && window.__twinMonitorBoxes?.floorId === floorId) return
    pose.floorId = floorId
    pose.x = elements[12]!
    pose.y = elements[13]!
    pose.z = elements[14]!
    pose.fx = elements[8]!
    pose.fy = elements[9]!
    pose.fz = elements[10]!
    pose.w = width
    pose.h = height
    const elevation = floorSpec(floorId).elevation
    const alarm: Array<{
      deskId: string
      box: { x: number; y: number; w: number; h: number }
      patches: Array<{ name: string; box: { x: number; y: number; w: number; h: number } }>
    }> = []
    const online: Array<{
      deskId: string
      box: { x: number; y: number; w: number; h: number }
      patches: Array<{ name: string; box: { x: number; y: number; w: number; h: number } }>
    }> = []
    slots.forEach((slot, index) => {
      const deskId = deskIds[index]
      const color = colors[index]
      if (!deskId || !color) return
      const screen = boxFromCorners(
        monitorScreenCorners(slot, elevation, SLAB_M).map((point) =>
          projectCanvas(camera, width, height, point.x, point.y, point.z),
        ),
        width,
        height,
        0.12,
      )
      const plate = boxFromCorners(
        monitorPlateCorners(slot, elevation, SLAB_M).map((point) =>
          projectCanvas(camera, width, height, point.x, point.y, point.z),
        ),
        width,
        height,
        0.22,
      )
      const box = screen ?? plate
      if (!box) return
      const patches = [
        ...MONITOR_SCREEN_PATCHES.flatMap((patch) => {
          const next = boxFromCorners(
            monitorScreenPatchCorners(slot, elevation, patch, SLAB_M).map((point) =>
              projectCanvas(camera, width, height, point.x, point.y, point.z),
            ),
            width,
            height,
            0.06,
          )
          return next ? [{ name: patch.name, box: next }] : []
        }),
        ...(plate ? [{ name: 'plate', box: plate }] : []),
      ]
      const entry = { deskId, box, patches }
      if (color.getHex() === MONITOR_DISPLAY_COLOR.alarm.getHex()) alarm.push(entry)
      if (color.getHex() === MONITOR_DISPLAY_COLOR.online.getHex()) online.push(entry)
    })
    window.__twinMonitorBoxes = {
      floorId,
      canvas: { width, height },
      alarm: pickDesk(alarm, width, height),
      online: pickDesk(online, width, height),
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
    camera.updateMatrixWorld()
    const spec = floorSpec(selected)
    const neighborId = neighborFloorId(selected)
    const neighbor = floorSpec(neighborId)
    const width = gl.domElement.width
    const height = gl.domElement.height
    const selectedHits = facadeGlassCorners(spec.elevation, spec.height).map((point) =>
      projectCanvas(camera, width, height, point.x, point.y, point.z),
    )
    const neighborHits = facadeGlassCorners(neighbor.elevation, neighbor.height).map((point) =>
      projectCanvas(camera, width, height, point.x, point.y, point.z),
    )
    const selectedBox = boxFromCorners(selectedHits, width, height, 0.08)
    const neighborBox = boxFromCorners(neighborHits, width, height, 0.08)
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
