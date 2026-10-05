import {
  DoubleSide,
  FrontSide,
  InstancedMesh,
  MeshDepthMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three'
import { describe, expect, it } from 'vitest'
import { BoxGeometry } from 'three'
import {
  bindSharedInstancedProxy,
  configureDepthProxyMaterial,
  releaseSharedInstancedProxy,
  writePersonInstanceMatrix,
} from './monitorDepthProxy'

describe('monitor depth proxy helpers', () => {
  it('chair proxy uses DoubleSide and copies alphaTest', () => {
    const material = new MeshDepthMaterial()
    const source = new MeshStandardMaterial({ side: FrontSide, alphaTest: 0.4 })
    configureDepthProxyMaterial(material, source, true)
    expect(material.side).toBe(DoubleSide)
    expect(material.colorWrite).toBe(false)
    expect(material.alphaTest).toBe(0.4)
  })

  it('office desk proxy follows the source side and skips zero alphaTest', () => {
    const material = new MeshDepthMaterial()
    const source = new MeshStandardMaterial({ side: FrontSide, alphaTest: 0 })
    configureDepthProxyMaterial(material, source, false)
    expect(material.side).toBe(FrontSide)
    expect(material.alphaTest).toBe(0)
  })

  it('shares geometry and instanceMatrix without disposing them on release', () => {
    const geometry = new BoxGeometry(1, 1, 1)
    const source = new InstancedMesh(geometry, new MeshStandardMaterial(), 4)
    const placeholder = new BoxGeometry(0.01, 0.01, 0.01)
    const proxy = new InstancedMesh(placeholder, new MeshDepthMaterial(), 1)
    const sourceMatrix = source.instanceMatrix
    bindSharedInstancedProxy(proxy, source)
    expect(proxy.geometry).toBe(geometry)
    expect(proxy.instanceMatrix).toBe(sourceMatrix)
    expect(proxy.count).toBe(4)
    releaseSharedInstancedProxy(proxy, placeholder)
    expect(proxy.geometry).toBe(placeholder)
    expect(proxy.instanceMatrix).not.toBe(sourceMatrix)
    expect(source.geometry).toBe(geometry)
    expect(source.instanceMatrix).toBe(sourceMatrix)
    expect(source.instanceMatrix.array.length).toBeGreaterThan(0)
    source.dispose()
    placeholder.dispose()
    geometry.dispose()
  })

  it('person instance matrix keeps position and heading but drops figure scale', () => {
    const person = new Object3D()
    person.position.set(3, 0, -2)
    person.rotation.set(0, 1.2, 0)
    person.scale.set(0.364, 0.364, 0.364)
    person.updateMatrix()
    const matrix = person.matrix.clone()
    writePersonInstanceMatrix(person, matrix)
    const position = new Vector3()
    const scale = new Vector3()
    matrix.decompose(position, new Quaternion(), scale)
    expect(position.x).toBeCloseTo(3)
    expect(position.z).toBeCloseTo(-2)
    expect(scale.x).toBeCloseTo(1)
    expect(scale.y).toBeCloseTo(1)
  })
})
