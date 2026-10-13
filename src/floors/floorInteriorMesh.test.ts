import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { floorSpec } from '../data/floors'
import { getFloorPlan } from './cache'
import { buildPrebuiltInterior, peekPrebuiltInterior } from './floorInteriorMesh'
import { hydrateFloorFromDisk } from './hydrateForTests'

describe('D283 各层室内几何', () => {
  it('同一层只建一次，墙和楼板留在缓存里', () => {
    hydrateFloorFromDisk('F2')
    const plan = getFloorPlan('F2')
    expect(plan).toBeTruthy()
    const first = buildPrebuiltInterior(floorSpec('F2'), plan!)
    const again = buildPrebuiltInterior(floorSpec('F2'), plan!)
    expect(again).toBe(first)
    expect(peekPrebuiltInterior('F2')).toBe(first)
    expect(first.content.getObjectByName('FloorSlab')).toBeTruthy()
    expect(first.content.getObjectByName('FloorPlate')).toBeTruthy()
    const walls = first.content.getObjectByName('FloorWalls') as { count?: number } | undefined
    expect(walls?.count).toBeGreaterThan(1000)
    expect(first.uploaded).toBe(false)
  })

  it('预热走主场景 compileAsync，上传不绘制，外壳裁切平面数为 1', () => {
    const prewarm = readFileSync(new URL('../scene/stage/prewarmFloorInterior.ts', import.meta.url), 'utf8')
    const shell = readFileSync(new URL('../scene/stage/shellClipCompile.ts', import.meta.url), 'utf8')
    expect(prewarm).toMatch(/INTERIOR_PREWARM_AFTER_FIRST_MS = 2600/)
    expect(prewarm).toMatch(/compileAsync\(root, camera, scene\)/)
    expect(prewarm).toMatch(/__twinScene/)
    expect(prewarm).toMatch(/glyphTimingProbeEnabled/)
    expect(prewarm).toMatch(/uploadObject/)
    const clipped = shell.slice(shell.indexOf('async function compileClippedShellMaterialsNow'))
    expect(clipped).not.toMatch(/compileInteriorMaterials/)
    expect(clipped).toMatch(/localClippingEnabled = true/)
    expect(clipped).toMatch(/compileWithScene\(renderer, group, camera, mainScene\)/)
    expect(clipped).toMatch(/planes: planes\.length/)
  })
})