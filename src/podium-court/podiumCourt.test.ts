import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { composeOverlay } from '../grid/mount'
import { courtyardHole, PODIUM_HEIGHT_M } from '../scene/massing'
import { COURT_DEPTH_M as SITE_COURT_DEPTH_M } from '../scene/siteGeometry'
import { PODIUM_COURT_SOURCE_BLOCK, stripPodiumCourtSource } from '../../scripts/podiumCourtPlugin'
import {
  makeAddonEaveMesh,
  makeCourtCurbMesh,
  makeCourtPlantMesh,
  makeCourtRiserMesh,
  makeCourtTreadMesh,
  makeRoofGrassMesh,
  meshBounds,
  meshVertexCount,
} from './geometry'
import {
  COURT_CURB_HEIGHT_M,
  COURT_CURB_Y_M,
  COURT_DEPTH_M,
  COURT_STEP_COUNT,
  COURT_STEP_TOP_Y_M,
  EAVE_BELOW_ROOF_M,
  EAVE_HEIGHT_M,
  EAVE_OUTSET_M,
  PODIUM_COURT_AFTER_FIRST_MS,
  eaveBottomY,
  eaveTopY,
  finTopY,
  podiumCourtChunkDue,
  podiumCourtDueLatched,
} from './plan'

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('T134 裙房檐口、屋顶绿化和下沉庭院', () => {
  it('复用已有 5.5 m 盆，不另挖一盆，也不改 FinRow 挂点', () => {
    expect(COURT_DEPTH_M).toBe(5.5)
    expect(SITE_COURT_DEPTH_M).toBe(5.5)
    expect(COURT_DEPTH_M).toBe(SITE_COURT_DEPTH_M)
    const podium = read('../components/scene/Podium.tsx')
    expect(podium).toMatch(/function makeBasin\(/)
    expect(podium.match(/makeBasin\(/g)?.length).toBe(2)
    expect(podium).toMatch(/-COURT_DEPTH_M/)
    expect(podium).toContain("../../scene/siteGeometry")
    expect(podium).toContain("name=\"CourtyardWall\"")
    expect(podium).toMatch(
      /<FinRow points=\{arc\} spacing=\{2\.2\} y=\{PODIUM_HEIGHT_M \/ 2\} height=\{PODIUM_HEIGHT_M \* 0\.92\} outwardFrom=\{focus\} \/>/,
    )
    expect(podium).not.toMatch(/podium-court/)
    expect(podium).not.toMatch(/useLoader\.preload/)
    expect(podium).not.toMatch(/MeshReflector|transmission|SSGI|pathtracer/)
  })

  it('加宽已有 eaveMaterial 带，压住翅片顶并高出屋面', () => {
    const podium = read('../components/scene/Podium.tsx')
    expect(EAVE_OUTSET_M).toBe(1)
    expect(EAVE_HEIGHT_M).toBe(1.5)
    expect(EAVE_BELOW_ROOF_M).toBe(1)
    expect(EAVE_OUTSET_M).toBeGreaterThan(0.16)
    expect(EAVE_HEIGHT_M).toBeGreaterThan(0.42)
    expect(podium).toMatch(/outset\(outline, 1, focus\), 1\.5/)
    expect(podium).toMatch(/name="PodiumEave"/)
    expect(podium).toMatch(/material=\{model \? solidMaterial : eaveMaterial\}/)
    expect(podium).toMatch(/position=\{\[0, PODIUM_HEIGHT_M - 1, 0\]\}/)
    expect(eaveBottomY(PODIUM_HEIGHT_M)).toBeLessThan(finTopY(PODIUM_HEIGHT_M))
    expect(eaveTopY(PODIUM_HEIGHT_M)).toBeGreaterThan(PODIUM_HEIGHT_M)
    expect(eaveTopY(PODIUM_HEIGHT_M) - PODIUM_HEIGHT_M).toBeCloseTo(0.5, 5)
  })

  it('屋顶草复用 T100 草地材质尺寸，铺在裙房屋面内收一圈', () => {
    const roof = makeRoofGrassMesh()
    const box = meshBounds(roof)
    expect(meshVertexCount(roof)).toBeGreaterThan(20)
    expect(box.minY).toBeCloseTo(PODIUM_HEIGHT_M, 4)
    expect(box.maxY).toBeCloseTo(PODIUM_HEIGHT_M + 0.1, 4)
    const outline = read('../components/scene/Podium.tsx')
    expect(outline).not.toMatch(/grassMaterial/)
    const detail = read('./PodiumCourtDetail.tsx')
    expect(detail).toMatch(/getObjectByName\('Park'\)/)
    expect(detail).toMatch(/name="PodiumRoofGrass"/)
    expect(detail).not.toMatch(/useLoader\.preload/)
    expect(detail).not.toMatch(/from ['"]\.\.\/scene\/materials['"]/)
  })

  it('在既有盆上加圈沿、台阶和盆底绿化，能读出 5.5 m 高差', () => {
    const curb = makeCourtCurbMesh()
    const treads = makeCourtTreadMesh()
    const risers = makeCourtRiserMesh()
    const plants = makeCourtPlantMesh()
    const curbBox = meshBounds(curb)
    const stepBox = meshBounds(treads)
    const riserBox = meshBounds(risers)
    const plantBox = meshBounds(plants)
    expect(meshVertexCount(curb)).toBeGreaterThan(20)
    expect(meshVertexCount(treads)).toBeGreaterThan(20)
    expect(courtyardHole().length).toBeGreaterThan(10)
    expect(curbBox.minY).toBeCloseTo(COURT_CURB_Y_M, 3)
    expect(curbBox.maxY).toBeCloseTo(COURT_CURB_Y_M + COURT_CURB_HEIGHT_M, 3)
    expect(stepBox.maxY).toBeCloseTo(COURT_STEP_TOP_Y_M, 3)
    expect(riserBox.minY).toBeCloseTo(-COURT_DEPTH_M, 3)
    expect(riserBox.maxY).toBeGreaterThan(COURT_STEP_TOP_Y_M - 1.2)
    expect(plantBox.minY).toBeCloseTo(-COURT_DEPTH_M, 3)
    expect(plantBox.maxY).toBeLessThan(0)
    expect(COURT_STEP_COUNT).toBe(5)
    const rise = (COURT_STEP_TOP_Y_M + COURT_DEPTH_M) / COURT_STEP_COUNT
    expect(rise).toBeGreaterThan(1)
    const detail = read('./PodiumCourtDetail.tsx')
    expect(detail).toMatch(/name="CourtyardCurb"/)
    expect(detail).toMatch(/name="CourtyardSteps"/)
    expect(detail).toMatch(/name="CourtyardPlanting"/)
    expect(detail).not.toMatch(/makeBasin/)
  })

  it('南侧加建的檐口与主带同高同出挑，接在已有 eaveMaterial 上', () => {
    const addon = makeAddonEaveMesh()
    const box = meshBounds(addon)
    expect(meshVertexCount(addon)).toBeGreaterThan(10)
    expect(box.minY).toBeCloseTo(0, 4)
    expect(box.maxY).toBeCloseTo(EAVE_HEIGHT_M, 4)
    const detail = read('./PodiumCourtDetail.tsx')
    expect(detail).toMatch(/name="PodiumSouthEave"/)
    expect(detail).toMatch(/PODIUM_HEIGHT_M - EAVE_BELOW_ROOF_M/)
  })

  it('细部几何在首帧 +2600ms 之后才挂，不进 hardGate', () => {
    expect(PODIUM_COURT_AFTER_FIRST_MS).toBe(2600)
    expect(podiumCourtChunkDue(undefined, 4000)).toBe(false)
    expect(podiumCourtChunkDue(1000, 3599)).toBe(false)
    expect(podiumCourtChunkDue(1000, 3600)).toBe(true)
    expect(podiumCourtDueLatched(true, undefined, 0)).toBe(true)
    const dock = read('../viewmarks/dock.tsx')
    const vite = read('../../vite.config.ts')
    const plugin = read('../../scripts/podiumCourtPlugin.ts')
    const podium = read('../components/scene/Podium.tsx')
    const scene = read('../components/Scene.tsx')
    const fx = read('../components/scene/postfx/balancedFx.tsx')
    const loop = read('../components/scene/DemandLoop.tsx')
    expect(dock).toContain(PODIUM_COURT_SOURCE_BLOCK)
    expect(dock).toMatch(/from '\.\/ViewmarkDock'\n\n\/\/ T134：/)
    expect(stripPodiumCourtSource(dock)).toMatch(/from '\.\/ViewmarkDock'\n\n+\/\/ T046：/)
    expect(stripPodiumCourtSource(dock)).not.toMatch(/podium-court|mountPodiumCourt/)
    expect(() => stripPodiumCourtSource('const dock = 1')).toThrow(/T134/)
    expect(plugin).toMatch(/name: 'podium-court-after-hash'/)
    expect(vite).toMatch(/podiumCourtAfterHash\(\)/)
    expect(vite).toMatch(/cubeProbeAfterHash\(\),\n    podiumCourtAfterHash\(\),\n    isolateTransformControlsLeaves\(\),/)
    expect(podium).not.toMatch(/podium-court|mountPodiumCourt|PodiumCourtDetail/)
    expect(scene).not.toMatch(/podium-court|mountPodiumCourt|PodiumCourtDetail/)
    expect(fx).not.toMatch(/podium-court|mountPodiumCourt|PodiumCourtDetail/)
    expect(loop).not.toMatch(/podium-court|mountPodiumCourt|PodiumCourtDetail/)
  })

  it('格网槽在探针之后挂庭院细部，不挤掉既有叠加', () => {
    const grid = read('../grid/mount.ts')
    expect(grid).toMatch(/__twinPodiumCourtNode/)
    expect(composeOverlay.length).toBe(3)
    expect(
      composeOverlay(
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        'court',
      ),
    ).toBe('court')
    expect(
      composeOverlay(null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'probe'),
    ).toBe('probe')
  })

  it('不重开 T100、不加屋顶瓦、不把近场路网和南侧圆形大草坪做进本刀', () => {
    const detail = read('./PodiumCourtDetail.tsx')
    const geometry = read('./geometry.ts')
    const plan = read('./plan.ts')
    const site = read('../components/scene/Site.tsx')
    expect(detail).not.toMatch(/roof.?tile|瓦|MeshReflector|transmission/i)
    expect(geometry).not.toMatch(/roadRibbons|zebraStripes|circular lawn|南侧圆形/)
    expect(plan).toMatch(/不铺近场路网和南侧圆形大草坪（T138）/)
    expect(site).not.toMatch(/podium-court/)
  })
})
