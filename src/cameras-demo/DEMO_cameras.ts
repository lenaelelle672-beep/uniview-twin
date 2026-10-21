/**
 * DEMO 摄像头锚点。
 *
 * 现网 Device.type==='camera' 没有坐标。工位圆标明确不给打印机、摄像头另造落点
 * （scene/stage/badges.ts）。这里的 x/z/heading 全部是合成的，只给覆盖锥演示。
 * 不是设备台账，也不是图纸里的摄像机。
 *
 * 坐标与工位同一套：米，+X 东，-Z 北，原点在塔楼平面中心。
 * heading 为绕 Y 的弧度：0 朝北（-Z），正角逆时针，与 three.js 一致。
 */
import { floorIdList, isFloorId } from '../data/floors'
import { CAMERA_LIMITS } from '../scene/cameras'

/** 一层最多挂这么多锥。多出来的锚点不进场景。 */
export const CAMERA_CONE_CAP = 6

/** 每层至少这些个，验收要看到 4–6。 */
export const CAMERA_CONE_MIN = 4

/** 锥长（米）。apex 在机位，沿 heading 张开。 */
export const CAMERA_CONE_LENGTH = 8

/** 底面半径（米）。半角约 23°，整锥大约 46°。 */
export const CAMERA_CONE_RADIUS = 3.4

/** 相对楼板顶的安装高度（米）。低于内墙 2.55，人眼能从侧面看见锥。 */
export const CAMERA_MOUNT_Y = 2.15

/**
 * 注视点沿视线走这么远，眼点仍停在机位上。
 * 大于 CameraRig 的 minDistance，setLookAt 不会被最近距离推开。
 */
export const POV_REACH_M = CAMERA_LIMITS.minDistance + 6

/** 注视点比机位低这么多，进 POV 时略向下看楼板。 */
export const POV_DROP_M = 1.4

export const HEADING_NORTH = 0
export const HEADING_EAST = -Math.PI / 2
export const HEADING_SOUTH = Math.PI
export const HEADING_WEST = Math.PI / 2

export interface DemoCameraAnchor {
  /** 合成编号，形如 DEMO-F12-CAM1。 */
  id: string
  floorId: string
  x: number
  z: number
  heading: number
}

interface DemoSlot {
  x: number
  z: number
  heading: number
}

/**
 * 地上层共用这一组。抽过 F1–F22 的板边和核心筒，六点都在板内、不在筒里。
 * 朝向指向楼内，而不是立刻穿出外墙。
 */
const TOWER_SLOTS: readonly DemoSlot[] = [
  { x: -20.5, z: 3.2, heading: HEADING_EAST },
  { x: 18.4, z: -4.6, heading: HEADING_WEST },
  { x: -8.2, z: 11.4, heading: HEADING_NORTH },
  { x: 6.5, z: -11.2, heading: HEADING_SOUTH },
  { x: 21.2, z: 8.6, heading: Math.PI / 4 },
  { x: -14.8, z: -7.4, heading: (5 * Math.PI) / 4 },
]

/**
 * B1 单独一组。前厅、餐厅西侧、核心筒南侧，以及西侧走道。
 * 避开中庭椭圆和电梯厅盒子。
 */
const B1_SLOTS: readonly DemoSlot[] = [
  { x: 49.07, z: 12.97, heading: HEADING_WEST },
  { x: 62.4, z: 16.2, heading: HEADING_SOUTH },
  { x: 11.14, z: -1.2, heading: HEADING_SOUTH },
  { x: -20.5, z: 3.2, heading: HEADING_EAST },
  { x: -8.2, z: 11.4, heading: HEADING_NORTH },
  { x: 28.6, z: 7.2, heading: HEADING_WEST },
]

/** 4、5 或 6。按层号错开，封顶不超过 CAMERA_CONE_CAP。 */
export function demoConeCount(floorId: string): number {
  if (!isFloorId(floorId)) return 0
  const level = floorId === 'B1' ? 1 : Number(floorId.slice(1))
  const count = CAMERA_CONE_MIN + (Math.abs(level) % 3)
  return Math.min(CAMERA_CONE_CAP, count)
}

export function demoCameraAnchors(floorId: string): DemoCameraAnchor[] {
  if (!isFloorId(floorId)) return []
  const slots = floorId === 'B1' ? B1_SLOTS : TOWER_SLOTS
  const count = demoConeCount(floorId)
  return slots.slice(0, count).map((slot, index) => ({
    id: `DEMO-${floorId}-CAM${index + 1}`,
    floorId,
    x: slot.x,
    z: slot.z,
    heading: slot.heading,
  }))
}

/** 0 朝北。返回楼层平面上的单位方向。 */
export function headingDirection(heading: number): { x: number; z: number } {
  return { x: -Math.sin(heading), z: -Math.cos(heading) }
}

export function cameraPovLook(anchor: DemoCameraAnchor): {
  eye: { x: number; y: number; z: number }
  target: { x: number; y: number; z: number }
} {
  const dir = headingDirection(anchor.heading)
  const eye = { x: anchor.x, y: CAMERA_MOUNT_Y, z: anchor.z }
  return {
    eye,
    target: {
      x: eye.x + dir.x * POV_REACH_M,
      y: eye.y - POV_DROP_M,
      z: eye.z + dir.z * POV_REACH_M,
    },
  }
}

/** 23 层都有表。测试用来确认没有漏层。 */
export function demoFloors(): string[] {
  return floorIdList()
}
