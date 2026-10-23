import { describe, expect, it } from 'vitest'
import {
  BufferGeometry,
  Euler as ThreeEuler,
  OctahedronGeometry as ThreeOctahedron,
  Quaternion,
  SphereGeometry as ThreeSphere,
  TorusGeometry as ThreeTorus,
} from 'three'
import { Euler, Line, LineBasicMaterial, OctahedronGeometry, SphereGeometry, TorusGeometry } from './gizmoLeaves'

function positions(geometry: BufferGeometry): number[] {
  return Array.from(geometry.getAttribute('position').array)
}

describe('gizmo 叶子几何', () => {
  it('和 three 的拾取几何顶点一致', () => {
    expect(positions(new OctahedronGeometry(0.1, 0))).toEqual(positions(new ThreeOctahedron(0.1, 0)))
    expect(positions(new OctahedronGeometry(0.2, 0))).toEqual(positions(new ThreeOctahedron(0.2, 0)))
    expect(positions(new OctahedronGeometry(0.04, 0))).toEqual(positions(new ThreeOctahedron(0.04, 0)))
    expect(positions(new OctahedronGeometry(0.01, 2))).toEqual(positions(new ThreeOctahedron(0.01, 2)))
    expect(positions(new TorusGeometry(1, 0.1, 4, 24))).toEqual(positions(new ThreeTorus(1, 0.1, 4, 24)))
    expect(positions(new TorusGeometry(1.25, 0.1, 2, 24))).toEqual(positions(new ThreeTorus(1.25, 0.1, 2, 24)))
    expect(positions(new SphereGeometry(0.7, 10, 8))).toEqual(positions(new ThreeSphere(0.7, 10, 8)))
    expect(positions(new SphereGeometry(0.48, 16, 12))).toEqual(positions(new ThreeSphere(0.48, 16, 12)))
  })

  it('欧拉角能喂给入口包的 Quaternion', () => {
    const local = new Euler().set(0, Math.PI / 2, 0)
    const real = new ThreeEuler().set(0, Math.PI / 2, 0)
    const fromLocal = new Quaternion().setFromEuler(local as unknown as ThreeEuler)
    const fromReal = new Quaternion().setFromEuler(real)
    expect(fromLocal.toArray()).toEqual(fromReal.toArray())
  })

  it('线段 clone 保留几何，手柄才能复制', () => {
    const geometry = new BufferGeometry()
    const material = new LineBasicMaterial({ color: 0xff00ff })
    const line = new Line(geometry, material)
    const copy = line.clone()
    expect(copy.geometry).toBe(geometry)
    expect(copy.material).toBe(material)
    expect(copy.isLine).toBe(true)
    expect(copy.geometry.clone()).toBeInstanceOf(BufferGeometry)
  })

  it('线段材质走 basic 着色器类型', () => {
    const material = new LineBasicMaterial({ color: 0xff0000, linewidth: 1, fog: false, toneMapped: false })
    const copy = material.clone()
    expect(material.type).toBe('LineBasicMaterial')
    expect(material.isLineBasicMaterial).toBe(true)
    expect(copy.type).toBe('LineBasicMaterial')
    expect(copy.color.getHex()).toBe(0xff0000)
    expect(copy.fog).toBe(false)
  })
})
