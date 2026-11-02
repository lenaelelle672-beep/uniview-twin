import { useGLTF } from '@react-three/drei/core/Gltf'
import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Box3, Matrix4 } from 'three'
import type { BufferGeometry, InstancedMesh, Material, Mesh, Object3D } from 'three'
import { useTwinStore } from '../store/store'
import {
  CHAIR_FOOTPRINT,
  CHAIR_SLOT_Z,
  CHAIR_YAW,
  DESK_FOOTPRINT,
  DESK_YAW,
  KENNEY_CHAIR_URL,
  KENNEY_DESK_URL,
  KENNEY_SEED_CAP,
  fitToFootprint,
  kenneySeedCount,
  type Footprint,
} from './plan'

/**
 * T102：进层之后才挂的 Kenney 桌椅。
 * useGLTF 关掉 Draco / Meshopt。实例矩阵抄 WorkstationDesks 的休息姿态世界矩阵，
 * 写在另一组 KenneyDesk / KenneyChair 上，不调用 instanceMatrix。
 */

const EMPTY_RAYCAST = () => {}

interface Part {
  geometry: BufferGeometry
  material: Material
}

interface MatrixHost {
  count: number
  isInstancedMesh: boolean
  matrixWorld: Matrix4
  getMatrixAt: (index: number, target: Matrix4) => void
  updateWorldMatrix: (updateParents: boolean, updateChildren: boolean) => void
}

function isHost(value: unknown): value is MatrixHost {
  if (!value || typeof value !== 'object') return false
  const host = value as Partial<MatrixHost>
  return (
    host.isInstancedMesh === true &&
    typeof host.getMatrixAt === 'function' &&
    typeof host.count === 'number' &&
    typeof host.updateWorldMatrix === 'function' &&
    host.matrixWorld != null
  )
}

function bakeParts(root: Object3D, footprint: Footprint, offsetZ: number, yaw: number): Part[] {
  root.updateMatrixWorld(true)
  const box = new Box3().setFromObject(root)
  const fit = fitToFootprint(
    {
      minX: box.min.x,
      minY: box.min.y,
      minZ: box.min.z,
      maxX: box.max.x,
      maxY: box.max.y,
      maxZ: box.max.z,
    },
    footprint,
    offsetZ,
  )
  const center = new Matrix4().makeTranslation(-fit.centerX, -fit.minY, -fit.centerZ)
  const turn = new Matrix4().makeRotationY(yaw)
  const scale = new Matrix4().makeScale(fit.scale, fit.scale, fit.scale)
  const shift = new Matrix4().makeTranslation(0, 0, fit.offsetZ)
  const baked = shift.multiply(scale).multiply(turn).multiply(center)
  const parts: Part[] = []
  root.traverse((child) => {
    const mesh = child as Mesh
    if (mesh.isMesh !== true) return
    const geometry = mesh.geometry.clone()
    geometry.applyMatrix4(mesh.matrixWorld)
    geometry.applyMatrix4(baked)
    geometry.computeBoundingSphere()
    const source = mesh.material
    const material = Array.isArray(source) ? source[0] : source
    if (!material) {
      geometry.dispose()
      return
    }
    parts.push({ geometry, material })
  })
  return parts
}

function readSeedMatrices(scene: { getObjectByName: (name: string) => unknown }): Matrix4[] {
  const found = scene.getObjectByName('WorkstationDesks')
  if (!isHost(found)) return []
  found.updateWorldMatrix(true, false)
  const count = kenneySeedCount(found.count)
  const local = new Matrix4()
  const matrices: Matrix4[] = []
  for (let index = 0; index < count; index += 1) {
    found.getMatrixAt(index, local)
    matrices.push(new Matrix4().multiplyMatrices(found.matrixWorld, local))
  }
  return matrices
}

function sameMatrices(prev: Matrix4[], next: Matrix4[]): boolean {
  if (prev.length !== next.length) return false
  for (let index = 0; index < prev.length; index += 1) {
    const left = prev[index]?.elements
    const right = next[index]?.elements
    if (!left || !right) return false
    for (let cell = 0; cell < 16; cell += 1) {
      if (left[cell] !== right[cell]) return false
    }
  }
  return true
}

function SeedMesh({
  name,
  geometry,
  material,
  matrices,
}: {
  name: string
  geometry: BufferGeometry
  material: Material
  matrices: Matrix4[]
}) {
  const ref = useRef<InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const array = mesh.instanceMatrix.array
    for (let index = 0; index < matrices.length; index += 1) {
      const elements = matrices[index]?.elements
      if (!elements) continue
      for (let cell = 0; cell < 16; cell += 1) array[index * 16 + cell] = elements[cell] ?? 0
    }
    mesh.count = matrices.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    mesh.frustumCulled = false
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.raycast = EMPTY_RAYCAST
  }, [geometry, material, matrices])
  return (
    <instancedMesh
      name={name}
      ref={ref}
      args={[geometry, material, KENNEY_SEED_CAP]}
      frustumCulled={false}
      castShadow
      receiveShadow
      onUpdate={(mesh) => {
        mesh.raycast = EMPTY_RAYCAST
      }}
    />
  )
}

export function KenneyStations() {
  const desk = useGLTF(KENNEY_DESK_URL, false, false)
  const chair = useGLTF(KENNEY_CHAIR_URL, false, false)
  const scene = useThree((state) => state.scene)
  const floorId = useTwinStore((state) => state.selectedFloor)
  const deskParts = useMemo(() => bakeParts(desk.scene, DESK_FOOTPRINT, 0, DESK_YAW), [desk.scene])
  const chairParts = useMemo(
    () => bakeParts(chair.scene, CHAIR_FOOTPRINT, CHAIR_SLOT_Z, CHAIR_YAW),
    [chair.scene],
  )
  const [matrices, setMatrices] = useState<Matrix4[]>([])

  useEffect(() => {
    return () => {
      for (const part of deskParts) part.geometry.dispose()
      for (const part of chairParts) part.geometry.dispose()
    }
  }, [deskParts, chairParts])

  useEffect(() => {
    let stop = false
    const pull = () => {
      if (stop) return
      const next = readSeedMatrices(scene)
      setMatrices((prev) => (sameMatrices(prev, next) ? prev : next))
    }
    pull()
    const id = window.setInterval(pull, 200)
    return () => {
      stop = true
      window.clearInterval(id)
    }
  }, [scene, floorId])

  useEffect(() => {
    window.__twinKenney = {
      on: true,
      mounted: matrices.length > 0,
      floorId,
      desks: matrices.length,
      chairs: matrices.length,
      cap: KENNEY_SEED_CAP,
      deskUrl: KENNEY_DESK_URL,
      chairUrl: KENNEY_CHAIR_URL,
      impl: 'drei-useGLTF',
    }
    if (matrices.length > 0) void window.__twinInvalidate?.()
  }, [floorId, matrices.length])

  if (matrices.length === 0) return null
  return (
    <group name="KenneyFurniture" frustumCulled={false}>
      {deskParts.map((part, index) => (
        <SeedMesh
          key={`desk-${index}`}
          name="KenneyDesk"
          geometry={part.geometry}
          material={part.material}
          matrices={matrices}
        />
      ))}
      {chairParts.map((part, index) => (
        <SeedMesh
          key={`chair-${index}`}
          name="KenneyChair"
          geometry={part.geometry}
          material={part.material}
          matrices={matrices}
        />
      ))}
    </group>
  )
}
