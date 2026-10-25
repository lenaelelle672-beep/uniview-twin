import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CORE, MEETINGS, PANTRY, RECEPTION } from '../scene/stage/layout'
import { FOG_DENSITY } from '../scene/fog'
import { USER_CAMERA_SMOOTH_TIME } from '../scene/stage/cameraTransition'
import { composeOverlay } from '../grid/mount'
import { resetTwinStore, useTwinStore } from '../store/store'
import { lookupThreeExports, SEGMENTS_SOURCE_BLOCK } from '../../scripts/segmentsPlugin'
import { mountBatchSegments } from './mount'
import {
  B1_ELEVATION_M,
  FLOOR_LIFT_M,
  HELPER_COLOR,
  OVERVIEW_BOXES,
  OVERVIEW_Y,
  PARTITION_COLOR,
  SEGMENT_LIMIT,
  batchLineSignature,
  floorPartitionLines,
  floorPlanUrl,
  overviewLines,
  presentSegments,
  readRoomRings,
  segmentToggleTitle,
  segmentsLayerOn,
  searchOfUrl,
  segmentsQueryOn,
  segmentsWanted,
  type BatchLine,
} from './plan'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

function boxOf(id: string) {
  const box = OVERVIEW_BOXES.find((item) => item.id === id)
  if (!box) throw new Error(id)
  return box
}

describe('批线段封顶', () => {
  it('总览分区加两笔辅线，条数低于上限，两种角色都在', () => {
    const lines = overviewLines()
    expect(lines.length).toBe(OVERVIEW_BOXES.length * 4 + 2)
    expect(lines.length).toBeLessThan(SEGMENT_LIMIT)
    expect(SEGMENT_LIMIT).toBe(48)
    expect(lines.some((line) => line.role === 'partition' && line.color === PARTITION_COLOR)).toBe(true)
    expect(lines.some((line) => line.role === 'helper' && line.color === HELPER_COLOR)).toBe(true)
    expect(lines.every((line) => line.start[1] === OVERVIEW_Y && line.end[1] === OVERVIEW_Y)).toBe(true)
    expect(boxOf('core')).toMatchObject({ x0: CORE.x0, x1: CORE.x1, z0: CORE.z0, z1: CORE.z1 })
    expect(boxOf('meet-w')).toMatchObject(MEETINGS[0])
    expect(boxOf('meet-c')).toMatchObject(MEETINGS[1])
    expect(boxOf('meet-e')).toMatchObject(MEETINGS[2])
    expect(boxOf('reception')).toMatchObject(RECEPTION)
    expect(boxOf('pantry')).toMatchObject(PANTRY)
    const fitted = presentSegments(lines)
    expect(fitted.shown).toBe(lines.length)
    expect(fitted.dropped).toBe(0)
    expect(fitted.slots).toHaveLength(SEGMENT_LIMIT)
    expect(fitted.slots[lines.length]?.start).toEqual(fitted.slots[lines.length]?.end)
  })

  it('超出上限的房间边记入 dropped，槽位仍等于 limit', () => {
    const raw: unknown = JSON.parse(readFileSync(join(here, '../../public/floors/F12.json'), 'utf8'))
    const rings = readRoomRings(raw)
    const lines = floorPartitionLines(rings, 52.863 + FLOOR_LIFT_M)
    expect(rings.length).toBeGreaterThan(10)
    expect(lines.length).toBeGreaterThan(SEGMENT_LIMIT)
    expect(lines[0]?.role).toBe('helper')
    expect(lines.filter((line) => line.role === 'partition').length).toBeGreaterThan(SEGMENT_LIMIT)
    const fitted = presentSegments(lines)
    expect(fitted.limit).toBe(SEGMENT_LIMIT)
    expect(fitted.shown).toBe(SEGMENT_LIMIT)
    expect(fitted.dropped).toBe(lines.length - SEGMENT_LIMIT)
    expect(fitted.slots).toHaveLength(SEGMENT_LIMIT)
    expect(fitted.slots.every((line) => line.id.startsWith('pad-'))).toBe(false)
    expect(segmentToggleTitle({ on: true, shown: fitted.shown, dropped: fitted.dropped, limit: fitted.limit })).toMatch(
      /另有 \d+ 条未画/,
    )
    expect(segmentToggleTitle({ on: false, shown: 0, dropped: 0, limit: SEGMENT_LIMIT })).toMatch(/默认关/)
    expect(() => presentSegments(lines, SEGMENT_LIMIT + 1)).toThrow(/上限/)
  })

  it('不读人流路径，演示参数和图层缺省都是关', () => {
    expect(readRoomRings({ walkPaths: [[[0, 0], [1, 1]]], rooms: [] })).toEqual([])
    expect(readRoomRings(null)).toEqual([])
    expect(floorPlanUrl('B1')).toBeNull()
    expect(floorPlanUrl('F12')).toBe('/floors/F12.json')
    expect(floorPlanUrl('F1')).toBe('/floors/F01.json')
    expect(segmentsQueryOn('')).toBe(false)
    expect(segmentsQueryOn('?q=balanced')).toBe(false)
    expect(segmentsQueryOn('?segments=0')).toBe(false)
    expect(segmentsQueryOn('?q=balanced&segments=1')).toBe(true)
    expect(searchOfUrl('http://127.0.0.1:5190/?q=balanced&segments=1')).toBe('?q=balanced&segments=1')
    expect(searchOfUrl('http://127.0.0.1:5190/?segments=1#top')).toBe('?segments=1')
    expect(searchOfUrl('http://127.0.0.1:5190/')).toBe('')
    expect(segmentsQueryOn(searchOfUrl('http://127.0.0.1:5190/?q=balanced&segments=1'))).toBe(true)
    expect(segmentsLayerOn(null)).toBe(false)
    expect(segmentsLayerOn({})).toBe(false)
    expect(segmentsLayerOn({ segments: false })).toBe(false)
    expect(segmentsLayerOn({ segments: true })).toBe(true)
    expect(segmentsWanted({}, '')).toBe(false)
    expect(segmentsWanted({}, '?segments=1')).toBe(true)
    expect(segmentsWanted({ segments: true }, '')).toBe(true)
    expect(B1_ELEVATION_M).toBe(-5.5)
  })

  it('端点变化会改变签名，零长度补位不会多出一条可见线', () => {
    const line: BatchLine = {
      id: 'a',
      role: 'partition',
      color: PARTITION_COLOR,
      start: [0, 1, 0],
      end: [2, 1, 0],
    }
    const moved: BatchLine = { ...line, end: [3, 1, 0] }
    expect(batchLineSignature([line])).not.toBe(batchLineSignature([moved]))
    const fitted = presentSegments([line])
    expect(fitted.shown).toBe(1)
    expect(fitted.slots[0]?.end).toEqual([2, 1, 0])
    expect(fitted.slots[1]?.start).toEqual([0, 1, 0])
    expect(fitted.slots[1]?.end).toEqual([0, 1, 0])
  })
})

describe('批线开关默认关', () => {
  it('缺省字段不算开，打开后不改别人的图层', () => {
    resetTwinStore()
    const initial = useTwinStore.getState().layers
    expect(initial).not.toHaveProperty('segments')
    expect(segmentsLayerOn(initial)).toBe(false)
    useTwinStore.getState().setLayer('segments', true)
    const next = useTwinStore.getState().layers
    expect(segmentsLayerOn(next)).toBe(true)
    expect(next.people).toBe(true)
    expect(next.edges).toBe(false)
    expect((next as { wireframe?: boolean }).wireframe).toBeUndefined()
  })

  it('没有 document 时挂载直接返回', () => {
    expect(() => mountBatchSegments()).not.toThrow()
  })
})

describe('和测距格网共存', () => {
  it('第四个节点缺省时组合不变', () => {
    expect(composeOverlay(null, null, null)).toBeNull()
    expect(composeOverlay('measure', null, null)).toBe('measure')
    const withSegments = composeOverlay(null, null, null, 'segments')
    expect(withSegments).toBe('segments')
    const all = composeOverlay('measure', 'grid', 'author', 'segments')
    expect(all).toMatchObject({ props: { children: ['measure', 'grid', 'author', 'segments'] } })
  })
})

describe('批线分包', () => {
  it('懒挂在 dock 哈希之后，不进首屏，不改雾和 T032，也不接管测距和人流', () => {
    expect(USER_CAMERA_SMOOTH_TIME).toBe(0.42)
    expect(FOG_DENSITY.day).toBe(0.00112)
    expect(FOG_DENSITY.night).toBe(0.00096)

    const dock = read('../viewmarks/dock.tsx')
    const mount = read('./mount.ts')
    const live = read('./BatchSegments.tsx')
    const plan = read('./plan.ts')
    const plugin = read('../../scripts/segmentsPlugin.ts')
    const vite = read('../../vite.config.ts')
    const view = read('../store/viewSlice.ts')
    const measure = read('../measure/MeasureTool.tsx')
    const walks = read('../scene/stage/WalkPaths.tsx')
    const walkLogic = read('../scene/stage/walkPaths.ts')
    const decor = read('../scene/stage/floorDecor.tsx')
    const line = read('../../node_modules/@react-three/drei/core/Line.js')
    const segments = read('../../node_modules/@react-three/drei/core/Segments.js')
    const pkg = JSON.parse(read('../../package.json')) as { dependencies: Record<string, string> }

    expect(dock).toContain(SEGMENTS_SOURCE_BLOCK.trimEnd())
    expect(dock).toMatch(/import\('\.\.\/segments\/mount'\)/)
    expect(dock).toMatch(/mountBatchSegments\(\)/)
    expect(dock).not.toMatch(/from '\.\.\/segments\/mount'/)
    expect(plugin).toContain(SEGMENTS_SOURCE_BLOCK)
    expect(plugin).toMatch(/name: 'segments-after-hash'/)
    expect(plugin).toMatch(/apply: 'build'/)
    expect(plugin).toMatch(/assets\/SegmentMount\.js/)
    expect(plugin).toMatch(/assets\/BatchSegments\.js/)
    expect(vite).toMatch(/segmentsAfterHash/)

    expect(mount).toMatch(/import\('\.\/BatchSegments'\)/)
    expect(mount).not.toMatch(/import \{ BatchSegments \}/)
    expect(mount).not.toMatch(/@react-three|from 'three'/)
    expect(mount).toMatch(/dataset\.layer = 'segments'/)
    expect(mount).toMatch(/segmentsQueryOn/)
    expect(mount).toMatch(/getEntriesByType\('navigation'\)/)
    expect(mount).toMatch(/searchOfUrl/)
    expect(mount).toMatch(/__twinSegmentsNode/)
    expect(plan).not.toMatch(/walkPaths|WalkPaths|MeasureTool|MeasureLine|CatmullRom/)
    expect(live).toMatch(/@react-three\/drei\/core\/Segments/)
    expect(live).not.toMatch(/from '@react-three\/drei'/)
    expect(live).not.toMatch(/core\/Line/)
    expect(live).not.toMatch(/useFrame\(/)
    expect(live).toMatch(/<Segments[\s\S]*<Segment [\s\S]*<\/Segments>/)
    expect(live.match(/<Segments/g)).toHaveLength(1)
    expect(live.match(/<Segment /g)).toHaveLength(1)
    expect(live).toMatch(/limit=\{SEGMENT_LIMIT\}/)
    expect(live).not.toMatch(/limit=\{1000\}/)
    expect(live).toMatch(/invalidate\(\)/)
    expect(live).toMatch(/requestAnimationFrame\(\(\) => invalidate\(\)\)/)
    expect(live).toMatch(/batchLineSignature/)
    expect(live).toMatch(/release\(line\)[\s\S]*\}, \[\]\)/)
    expect(live).toMatch(/name="BatchSegments"/)
    expect(live).toMatch(/raycast = \(\) => null/)
    expect(live).toMatch(/material\.fog = false/)
    expect(live).not.toMatch(/FogExp2|FOG_DENSITY|smoothTime|WalkPaths|MeasureTool/)

    expect(line).toMatch(/lineMaterial\.dispose\(\)/)
    expect(line).toMatch(/\[lineGeom\]/)
    expect(segments).toMatch(/new LineMaterial\(\)/)
    expect(segments).not.toMatch(/lineMaterial\.dispose/)
    expect(segments).toMatch(/useFrame/)

    expect(measure).toMatch(/from '@react-three\/drei\/core\/Line'/)
    expect(measure).toMatch(/name="MeasureLine"/)
    expect(measure).not.toMatch(/Segments/)
    expect(walks).toMatch(/from '@react-three\/drei\/core\/Line'/)
    expect(walks).toMatch(/name="WalkPaths"/)
    expect(walks).not.toMatch(/Segments/)
    expect(walkLogic).not.toMatch(/Segments/)
    expect(decor).toMatch(/<WalkPaths floorId=\{floorId\} \/>/)
    expect(decor.match(/<WalkPaths /g)).toHaveLength(1)

    expect(view).toMatch(/LayerToggleKey = LayerKey \| 'wireframe' \| 'plaques' \| 'decals' \| 'segments'/)
    expect(view).not.toMatch(/segments:\s*(true|false)/)
    const panel = read('../viewmarks/LayerPanel.tsx')
    expect(panel).not.toMatch(/BatchSegments|segments\/mount|core\/Segments|批线/)
    expect(panel).not.toMatch(/\['segments'/)

    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../scene/stage/prefetchLazyChunks.ts',
      '../scene/fog.ts',
      '../scene/stage/cameraTransition.ts',
      '../scene/softShadows.ts',
      '../scene/stage/floorDecor.tsx',
      '../scene/stage/WalkPaths.tsx',
      '../measure/MeasureTool.tsx',
    ]
    for (const file of eager) {
      expect(read(file), file).not.toMatch(/BatchSegments|segments\/mount|core\/Segments|mountBatchSegments/)
    }

    const blob = [mount, live, plan].join('\n')
    expect(blob).not.toMatch(/from ['"][^'"]*(fog|cameraTransition|balancedFx|postfx|softShadows|DemandLoop|WalkPaths|MeasureTool)/)
    expect(pkg.dependencies['@react-three/drei']).toBe('10.7.9')
    expect(pkg.dependencies.three).toBe('0.186.1')
    expect(pkg.dependencies['@react-three/fiber']).toBe('9.8.1')
    expect(Object.keys(pkg.dependencies).sort()).toEqual(
      [
        '@react-three/drei',
        '@react-three/fiber',
        '@react-three/postprocessing',
        'postprocessing',
        'react',
        'react-dom',
        'three',
        'troika-three-text',
        'troika-three-utils',
        'troika-worker-utils',
        'zustand',
      ].sort(),
    )
  })

  it('从入口包命名空间认出 three 导出，缺的留给替身', () => {
    const index = `
      __proto__:null,Mesh:ps,ShaderMaterial:eo,Color:ot,Vector3:j},Symbol.toStringTag
      export{ps as a1,eo as ak,ot as ar,j as V}
    `
    const looked = lookupThreeExports(index, ['Mesh', 'Color', 'Vector3', 'Line3'])
    expect(looked.found).toEqual({ Mesh: 'a1', Color: 'ar', Vector3: 'V' })
    expect(looked.missing).toEqual(['Line3'])
  })
})
