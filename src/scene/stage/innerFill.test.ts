import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { peopleSkeletonSlots } from './peopleTextureSuspense'

const here = dirname(fileURLToPath(import.meta.url))

function read(path: string): string {
  return readFileSync(join(here, path), 'utf8')
}

describe('T093 内层 Suspense', () => {
  it('外壳和场地仍是 Scene 那一层，不用全屏 Loader', () => {
    const scene = read('../../components/Scene.tsx')
    const overlay = read('../../components/AssetLoadOverlay.tsx')
    const site = scene.indexOf('<Site ')
    const probe = scene.indexOf('<RenderProbe')
    expect(scene).toMatch(/<Suspense fallback={<BlankSuspenseFallback \/>}>/)
    expect(site).toBeGreaterThan(scene.indexOf('<Suspense fallback={<BlankSuspenseFallback \/>}>'))
    expect(probe).toBeGreaterThan(site)
    expect(scene).not.toMatch(/from '@react-three\/drei\/web\/Loader'/)
    expect(overlay).toMatch(/AssetLoadProgress/)
    expect(overlay).not.toMatch(/from '@react-three\/drei\/web\/Loader'/)
    expect(overlay).toMatch(/不用 <Loader>/)
  })

  it('工位先进低模盒，人物和贴图另开内层，不重做 Detailed 或房间标签', () => {
    const stations = read('Workstations.tsx')
    const meshes = read('workstationMeshes.tsx')
    const people = read('peopleTextureSuspense.tsx')
    const decor = read('floorDecor.tsx')
    const fill = read('innerFill.tsx')
    const pkg = read('../../../package.json')
    expect(stations).toMatch(/<Suspense fallback={<WorkstationSkeleton slots=\{slots\} \/>}>/)
    expect(stations).toMatch(/import\('\.\/workstationMeshes'\)/)
    expect(stations).toMatch(/InstancedSlots/)
    expect(meshes).toMatch(/name="Workstations"/)
    expect(meshes).toMatch(/name="WorkstationDesks"/)
    expect(meshes).toMatch(/name="WorkstationMonitors"/)
    expect(fill).toMatch(/name="WorkstationSkeleton"/)
    expect(decor).toMatch(/<PeopleTextureSuspense paths=\{paths\}>/)
    expect(decor).toMatch(/<CorridorPeople enabled paths=\{paths\} \/>/)
    expect(people).toMatch(/name="PeopleSkeleton"/)
    expect(people).toMatch(/<Suspense fallback={<PeopleSkeleton paths=\{paths\} \/>}>/)
    const fresh = [stations, meshes, people, decor, fill].join('\n')
    expect(fresh).not.toMatch(/from '@react-three\/drei\/web\/Loader'/)
    expect(fresh).not.toMatch(/from '@react-three\/drei\/core\/Detailed'/)
    expect(fresh).not.toMatch(/ProgressiveRoomLabels/)
    expect(pkg).toMatch(/"three": "0\.186\.1"/)
    expect(pkg).toMatch(/"@react-three\/drei": "10\.7\.9"/)
  })

  it('人物占位沿走廊取样，空路径不放盒子', () => {
    expect(peopleSkeletonSlots([])).toEqual([])
    const slots = peopleSkeletonSlots(undefined)
    expect(slots.length).toBeGreaterThan(0)
    for (const slot of slots) {
      expect(Number.isFinite(slot.x)).toBe(true)
      expect(Number.isFinite(slot.z)).toBe(true)
      expect(Number.isFinite(slot.rot)).toBe(true)
    }
    const placed = peopleSkeletonSlots([
      [
        { x: 3, z: 4 },
        { x: 3, z: 8 },
      ],
    ])
    expect(placed.length).toBe(slots.length)
    expect(placed.some((slot) => slot.x === 3)).toBe(true)
  })
})
