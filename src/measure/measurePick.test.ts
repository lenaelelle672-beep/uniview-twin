import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Plane,
  Scene,
  Vector2,
  Vector3,
} from 'three'
import { PICK_VOLUME_LAYER } from '../scene/pickLayers'
import { dismissTopEscapeLayer, resetEscapeLayers } from '../ui/escapeLayers'
import {
  bindMeasureEscape,
  createDragFramePump,
  createMeasureRaycaster,
  formatMeasureMeters,
  isMeasureClick,
  measureLabelText,
  measureLinePoints,
  measureRayMissesPickVolume,
  measureSessionKey,
  placeMeasurePoint,
  pointerToNdc,
  previewMeasureEnd,
  raycastMeasurePoint,
} from './measurePick'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

function slabAt(y: number, name = 'FloorSlab') {
  const mesh = new Mesh(new BoxGeometry(4, 0.2, 4), new MeshBasicMaterial())
  mesh.name = name
  mesh.position.set(0, y, 0)
  mesh.updateMatrixWorld(true)
  return mesh
}

function rayDown(originY = 8) {
  const raycaster = createMeasureRaycaster()
  raycaster.ray.origin.set(0, originY, 0)
  raycaster.ray.direction.set(0, -1, 0)
  return raycaster
}

describe('点到点测距拾取', () => {
  beforeEach(() => {
    resetEscapeLayers()
  })

  it('米制标签固定两位小数，单位不换行', () => {
    expect(formatMeasureMeters(12.345)).toBe('12.35\u00A0m')
    expect(formatMeasureMeters(0)).toBe('0.00\u00A0m')
    expect(formatMeasureMeters(Number.NaN)).toBe('')
  })

  it('拖动超过阈值不当成落点', () => {
    expect(isMeasureClick(0, 0)).toBe(true)
    expect(isMeasureClick(4, 4)).toBe(true)
    expect(isMeasureClick(8, 0)).toBe(false)
  })

  it('测量射线不开拾取体层', () => {
    const raycaster = createMeasureRaycaster()
    expect(measureRayMissesPickVolume(raycaster, PICK_VOLUME_LAYER)).toBe(true)
    expect(raycaster.far).toBe(4000)
  })

  it('Instanced 家具挡在前面时仍落到楼板', () => {
    const desk = new InstancedMesh(new BoxGeometry(2, 0.4, 2), new MeshBasicMaterial(), 1)
    desk.name = 'WorkstationDesks'
    desk.setMatrixAt(0, new Matrix4().makeTranslation(0, 1.2, 0))
    desk.computeBoundingSphere()
    desk.updateMatrixWorld(true)

    const floor = slabAt(0)
    const scene = new Scene()
    scene.add(desk, floor)

    const raycaster = rayDown(5)
    const blocked = raycaster.intersectObjects([desk, floor], false)
    expect(blocked[0]?.object).toBe(desk)

    const point = raycastMeasurePoint(raycaster, scene, true)
    expect(point).not.toBeNull()
    expect(point!.y).toBeCloseTo(0.1, 3)
  })

  it('FloorCut 剪掉的交点丢掉，改用切面下的楼板', () => {
    const plane = new Plane(new Vector3(0, -1, 0), 0.5)
    const clipped = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial({ clippingPlanes: [plane] }))
    clipped.name = 'FloorSlab'
    clipped.position.set(0, 2, 0)
    clipped.updateMatrixWorld(true)
    const floor = slabAt(0)
    const scene = new Scene()
    scene.add(clipped, floor)

    const raycaster = rayDown()
    const point = raycastMeasurePoint(raycaster, scene, true)
    expect(point!.y).toBeCloseTo(0.1, 3)

    const onlyClipped = new Scene()
    onlyClipped.add(clipped)
    expect(raycastMeasurePoint(raycaster, onlyClipped, true)).toBeNull()
  })

  it('裁切没开时，同一块板可以量', () => {
    const plane = new Plane(new Vector3(0, -1, 0), 0.5)
    const mesh = new Mesh(new BoxGeometry(2, 2, 2), new MeshBasicMaterial({ clippingPlanes: [plane] }))
    mesh.name = 'FloorSlab'
    mesh.position.set(0, 2, 0)
    mesh.updateMatrixWorld(true)
    const scene = new Scene()
    scene.add(mesh)
    const point = raycastMeasurePoint(rayDown(), scene, false)
    expect(point!.y).toBeCloseTo(3, 3)
  })

  it('隐藏楼板和封盖量不到；没起名的路面跟 Park 一起量', () => {
    const hiddenHost = new Group()
    hiddenHost.visible = false
    hiddenHost.add(slabAt(0))
    const cap = slabAt(1, 'FloorSlab')
    cap.userData.floorStencil = true
    const pick = slabAt(2, 'B1Pick')
    pick.layers.set(PICK_VOLUME_LAYER)

    const site = new Group()
    const park = new Mesh(new BoxGeometry(6, 0.1, 6), new MeshBasicMaterial())
    park.name = 'Park'
    park.position.set(0, 0, 0)
    const road = new Mesh(new BoxGeometry(1.2, 0.1, 1.2), new MeshBasicMaterial())
    road.position.set(2.2, 0.2, 0)
    const trees = new InstancedMesh(new BoxGeometry(0.4, 2, 0.4), new MeshBasicMaterial(), 1)
    trees.name = 'Trees'
    trees.setMatrixAt(0, new Matrix4().makeTranslation(2.2, 1.2, 0))
    trees.computeBoundingSphere()
    site.add(park, road, trees)
    site.updateMatrixWorld(true)

    const scene = new Scene()
    scene.add(hiddenHost, cap, pick, site)

    const raycaster = createMeasureRaycaster()
    raycaster.ray.origin.set(2.2, 6, 0)
    raycaster.ray.direction.set(0, -1, 0)
    const blocked = raycaster.intersectObjects([trees, road], false)
    expect(blocked[0]?.object).toBe(trees)
    const point = raycastMeasurePoint(raycaster, scene, true)
    expect(point!.y).toBeCloseTo(0.25, 3)
    expect(point!.x).toBeCloseTo(2.2, 3)
  })

  it('先落起点，再落终点；太近的第二次点击不提交', () => {
    const drafted = placeMeasurePoint(null, new Vector3(0, 0, 0))
    expect(drafted.committed).toBe(false)
    expect(drafted.end).toBeNull()
    expect(placeMeasurePoint(drafted, new Vector3(0.01, 0, 0))).toBe(drafted)
    const done = placeMeasurePoint(drafted, new Vector3(3, 0, 4))
    expect(done.committed).toBe(true)
    expect(done.end!.z).toBe(4)
    const again = placeMeasurePoint(done, new Vector3(1, 0, 0))
    expect(again.committed).toBe(false)
    expect(again.start.x).toBe(1)
  })

  it('预览只跟未提交的起点，标签和线只在有终点时出现', () => {
    const drafted = placeMeasurePoint(null, new Vector3(0, 1, 0))
    const preview = previewMeasureEnd(drafted, new Vector3(2, 1, 0))
    expect(preview?.end?.x).toBe(2)
    expect(previewMeasureEnd(preview, new Vector3(2, 1, 0))).toBe(preview)
    expect(measureLabelText(preview)).toBe('2.00\u00A0m')
    const line = measureLinePoints(preview)
    expect(line).toHaveLength(2)
    expect(line![0].y).toBeCloseTo(1.04, 5)
    expect(measureLabelText(drafted)).toBe('')
    expect(measureLinePoints(drafted)).toBeNull()
    const committed = placeMeasurePoint(drafted, new Vector3(2, 1, 0))
    expect(previewMeasureEnd(committed, new Vector3(9, 1, 0))).toBe(committed)
  })

  it('离层、换层、爆炸都会换成另一段会话', () => {
    const floor = measureSessionKey('floor', 'F12', false)
    expect(measureSessionKey('building', 'F12', false)).not.toBe(floor)
    expect(measureSessionKey('floor', 'F11', false)).not.toBe(floor)
    expect(measureSessionKey('floor', 'F12', true)).not.toBe(floor)
    expect(measureSessionKey('blueprint', null, false)).not.toBe(floor)
  })

  it('屏幕点换到 NDC，画布外返回空', () => {
    const target = new Vector2()
    const rect = { left: 10, top: 20, width: 100, height: 50 } as DOMRect
    const center = pointerToNdc(60, 45, rect, target)
    expect(center?.x).toBeCloseTo(0)
    expect(center?.y).toBeCloseTo(0)
    expect(pointerToNdc(0, 0, rect, target)).toBeNull()
  })

  it('Esc 经 measure 层退出，注销后不再挡住退层', () => {
    let exited = false
    const drop = bindMeasureEscape(() => {
      exited = true
    })
    expect(dismissTopEscapeLayer()).toBe(true)
    expect(exited).toBe(true)
    drop()
    expect(dismissTopEscapeLayer()).toBe(false)
  })

  it('拖动期间每帧都 invalidate，松开后停', () => {
    const calls: string[] = []
    const queued: Array<() => void> = []
    const pump = createDragFramePump(
      () => {
        calls.push('inv')
      },
      {
        request(callback) {
          queued.push(callback)
          return queued.length
        },
        cancel(id) {
          calls.push(`cancel:${id}`)
        },
      },
    )
    pump.start()
    pump.start()
    expect(queued).toHaveLength(1)
    queued[0]!()
    expect(calls).toEqual(['inv'])
    expect(queued).toHaveLength(2)
    pump.stop()
    expect(calls).toEqual(['inv', 'cancel:2', 'inv'])
    queued[1]!()
    expect(queued).toHaveLength(2)
    pump.stop()
    expect(calls.filter((item) => item === 'inv')).toHaveLength(2)
  })
})

describe('测距分包不进首屏', () => {
  it('主包和 DemandLoop 不静态引用工具，Esc / Line / Html 在懒包里', () => {
    const scene = read('../components/Scene.tsx')
    const stage = read('../components/Stage.tsx')
    const app = read('../App.tsx')
    const loop = read('../components/scene/DemandLoop.tsx')
    const dock = read('../viewmarks/dock.tsx')
    const boot = read('./boot.tsx')
    const tool = read('./MeasureTool.tsx')
    const pick = read('./measurePick.ts')
    const css = read('../index.css')
    const pkg = read('../../package.json')
    const prefetch = read('../scene/stage/prefetchLazyChunks.ts')

    expect(scene).not.toMatch(/MeasureTool|measure\/boot|measurePick/)
    expect(stage).not.toMatch(/MeasureTool|measure\/boot|测距/)
    expect(app).not.toMatch(/MeasureTool|measure\/boot/)
    expect(loop).toMatch(/__twinMeasureSlot/)
    expect(loop).not.toMatch(/MeasureTool|measure\/boot|@react-three\/drei\/core\/Line|@react-three\/drei\/web\/Html/)
    expect(dock).toMatch(/import\('\.\.\/measure\/boot'\)/)
    expect(dock).not.toMatch(/from '\.\.\/measure\/boot'/)
    expect(boot).toMatch(/import\('\.\/MeasureTool'\)/)
    expect(boot).not.toMatch(/from '\.\/MeasureTool'/)
    expect(boot).toMatch(/measure\.css\?inline/)
    expect(css).not.toMatch(/measure-toggle|measure-label/)
    expect(pkg).not.toMatch(/@thatopen/)
    expect(prefetch).toMatch(/FLOOR_SHELL_AFTER_FIRST_MS = 2600/)
    expect(prefetch).not.toMatch(/measure\/boot|MeasureTool/)

    expect(tool).toMatch(/@react-three\/drei\/core\/Line/)
    expect(tool).toMatch(/@react-three\/drei\/web\/Html/)
    expect(tool).toMatch(/bindMeasureEscape/)
    expect(tool).toMatch(/createDragFramePump/)
    expect(tool).toMatch(/raycastMeasurePoint/)
    expect(tool).toMatch(/pointsKey/)
    expect(tool).not.toMatch(
      /@thatopen|softShadows|DemandLoop|cameraRest|frameSchedule|balancedFx|FogExp2|smoothTime|OutlinePass|scene\/materials/,
    )
    expect(pick).toMatch(/isInstancedMesh/)
    expect(pick).toMatch(/clippingPlanes/)
    expect(pick).toMatch(/floorStencil/)
    expect(pick).toMatch(/FloorSlab/)
    expect(pick).toMatch(/name === 'Park'/)
    expect(pick).toMatch(/layers\.set\(0\)/)
    expect(pick).not.toMatch(/scene\/materials/)
  })
})
