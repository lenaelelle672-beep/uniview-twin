import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { showCorridorPeople } from './stage/corridor'
import { layerShown } from './layerGate'
import type { LayerFlags, LayerKey } from '../store/viewSlice'
import type { QualityTier } from '../types'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

const ALL_ON: LayerFlags = {
  people: true,
  labels: true,
  heat: true,
  outlines: true,
  badges: true,
  edges: true,
}
const KEYS: LayerKey[] = ['people', 'labels', 'heat', 'outlines', 'badges', 'edges']
const TIERS: QualityTier[] = ['perf', 'balanced', 'high']

describe('图层和画质一起决定画不画', () => {
  it('人流是画质且开关，其余图层只看开关', () => {
    for (const quality of TIERS) {
      expect(layerShown(quality, ALL_ON, 'people')).toBe(showCorridorPeople(quality, true))
      expect(layerShown(quality, { ...ALL_ON, people: false }, 'people')).toBe(showCorridorPeople(quality, false))
      for (const key of KEYS) {
        if (key === 'people') continue
        expect(layerShown(quality, ALL_ON, key)).toBe(true)
        expect(layerShown(quality, { ...ALL_ON, [key]: false }, key)).toBe(false)
      }
    }
    expect(layerShown('perf', ALL_ON, 'people')).toBe(false)
    expect(layerShown('balanced', { ...ALL_ON, people: false }, 'people')).toBe(false)
  })
})

describe('图层面板和判断不进首屏静态图', () => {
  it('面板是 dock 的懒包，首屏文件不引用它', () => {
    const dock = read('../viewmarks/dock.tsx')
    const panel = read('../viewmarks/LayerPanel.tsx')
    const gate = read('./layerGate.tsx')
    const floor = read('./stage/FloorStage.tsx')
    expect(dock).toMatch(/import\('\.\/LayerPanel'\)/)
    expect(dock).not.toMatch(/from '\.\/LayerPanel'/)
    expect(dock).toMatch(/mountAlarmTimeline/)
    expect(panel).toMatch(/data-layer-root/)
    expect(panel).toMatch(/setLayer/)
    expect(panel).not.toMatch(/three|@react-three|balancedFx|SoftShadows|troika|frameSchedule|DemandLoop|OutlinePass/)
    expect(gate).toMatch(/invalidate\(\)/)
    expect(gate).toMatch(/quality !== 'perf'/)
    expect(gate).not.toMatch(/softShadows|DemandLoop|cameraRest|frameSchedule|balancedFx|ZoneHeat|DeskOutline|Workstations|FloorStencilCap|JsonFloorInterior|troika|OutlinePass|AlarmTimeline/)
    expect(floor).toMatch(/from '\.\/showCorridorPeople'/)
    expect(floor).not.toMatch(/from '\.\/corridor'/)
    expect(floor).toMatch(/showCorridorPeople\(state\.quality, state\.layers\.people\)/)
    expect(floor).not.toMatch(/layerGate|LayerPanel/)
    const eager = [
      '../components/Scene.tsx',
      '../components/Stage.tsx',
      '../App.tsx',
      '../main.tsx',
      '../index.css',
      './stage/prefetchLazyChunks.ts',
      '../components/scene/postfx/balancedFx.tsx',
      '../components/scene/DemandLoop.tsx',
      '../components/scene/BalancedSoftShadows.tsx',
    ]
    for (const file of eager) {
      const source = read(file)
      expect(source).not.toMatch(/LayerPanel|layerGate|layer-panel/)
    }
    const consumers: Array<[string, string]> = [
      ['./stage/CorridorPeople.tsx', 'people'],
      ['./stage/RoomLabels.tsx', 'labels'],
      ['./stage/ZoneHeatMesh.tsx', 'heat'],
      ['./stage/DeskOutline.tsx', 'outlines'],
      ['./stage/DeviceBadges.tsx', 'badges'],
    ]
    for (const [file, key] of consumers) {
      const source = read(file)
      expect(source).toMatch(new RegExp(`useLayerShown\\('${key}'\\)`))
      expect(source).not.toMatch(/OutlinePass|Reflector|transmission|Vignette|ssgi|pathtracer|jsdelivr|FloorBadges/)
    }
    expect(read('./stage/lazyZoneHeat.tsx')).toMatch(/import\('\.\/ZoneHeatMesh'\)/)
    expect(read('../viewmarks/viewmark.css')).toMatch(/\.viewmark-row/)
    expect(read('./stage/DeskOutline.tsx')).toMatch(/HiddenLayer/)
    expect(read('./stage/ZoneHeatMesh.tsx')).toMatch(/HiddenLayer/)
  })
})
