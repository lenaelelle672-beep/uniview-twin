import { describe, expect, it } from 'vitest'
import { Group, Mesh, MeshStandardMaterial, Plane, Vector3 } from 'three'
import { applyEastGrilleCut } from './FloorCut'

describe('east_grille 裁切', () => {
  it('hi/lo 两套 east_grille 都写 clippingPlanes 和 clipShadows', () => {
    const planes = [new Plane(new Vector3(0, -1, 0), 19.01)]
    const root = new Group()
    root.name = 'EastGrille'
    for (const label of ['lo', 'hi']) {
      const material = new MeshStandardMaterial({ name: 'east_grille' })
      const mesh = new Mesh(undefined, material)
      mesh.name = `east_grille_v4_${label}`
      mesh.customDepthMaterial = new MeshStandardMaterial({ name: 'east_grille_depth' })
      root.add(mesh)
    }
    applyEastGrilleCut(root, planes, true)
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return
      const material = object.material as MeshStandardMaterial
      expect(material.clippingPlanes).toBe(planes)
      expect(material.clipShadows).toBe(true)
      expect(object.customDepthMaterial?.clippingPlanes).toBe(planes)
      expect(object.customDepthMaterial?.clipShadows).toBe(true)
    })
    applyEastGrilleCut(root, null, false)
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return
      const material = object.material as MeshStandardMaterial
      expect(material.clippingPlanes).toBeNull()
      expect(material.clipShadows).toBe(false)
    })
  })
})
